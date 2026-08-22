import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { logger } from './logger';
import { AppError } from './helpers';

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

export interface SecureFetchOptions {
  allowedHosts?: string[];
  maxRedirects?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
  allowedContentTypePrefixes?: string[];
}

function isDisallowedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast/reserved

  return false;
}

function isDisallowedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower === '::') return true;
  if (lower === '::1') return true;

  // IPv4-mapped IPv6.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isDisallowedIPv4(mapped[1]);
  }

  // IPv4-compatible IPv6.
  const compatible = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (compatible) {
    return isDisallowedIPv4(compatible[1]);
  }

  // fc00::/7 — unique local.
  if (/^f[cd]/.test(lower)) return true;

  // fe80::/10 — link local.
  if (/^fe[89ab]/.test(lower)) return true;

  // ff00::/8 — multicast.
  if (lower.startsWith('ff')) return true;

  return false;
}

function isDisallowedIP(ip: string): boolean {
  const family = net.isIP(ip);

  if (family === 4) return isDisallowedIPv4(ip);
  if (family === 6) return isDisallowedIPv6(ip);

  return true;
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/\.$/, '').toLowerCase();
}

function hostAllowed(hostname: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts?.length) return true;

  const host = normalizeHost(hostname);

  return allowedHosts.some((allowed) => {
    const candidate = normalizeHost(allowed);

    // Exact host match only.
    // Do NOT treat evil-goodreads.com as goodreads.com.
    return host === candidate;
  });
}

async function resolveAndValidateHost(hostname: string): Promise<void> {
  const host = normalizeHost(hostname);

  if (!host) {
    throw AppError.badRequest('Remote host missing', 'SSRF_BLOCKED');
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw AppError.badRequest(
      'Refusing to fetch from local host',
      'SSRF_BLOCKED',
    );
  }

  if (net.isIP(host)) {
    if (isDisallowedIP(host)) {
      throw AppError.badRequest(
        `Refusing to fetch from disallowed address: ${host}`,
        'SSRF_BLOCKED',
      );
    }

    return;
  }

  let records: string[] = [];

  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(host).catch(() => [] as string[]),
      dns.resolve6(host).catch(() => [] as string[]),
    ]);

    records = [...v4, ...v6];
  } catch (error) {
    logger.warn('SSRF DNS resolution failed', {
      hostname: host,
      error: error instanceof Error ? error.message : String(error),
    });

    throw AppError.badRequest(
      'Failed to resolve remote host',
      'SSRF_DNS_FAILED',
    );
  }

  if (!records.length) {
    throw AppError.badRequest(
      'Remote host did not resolve',
      'SSRF_DNS_FAILED',
    );
  }

  // Fail closed if ANY address is private/reserved.
  for (const ip of records) {
    if (isDisallowedIP(ip)) {
      throw AppError.badRequest(
        `Remote host resolves to a disallowed address`,
        'SSRF_BLOCKED',
      );
    }
  }
}

async function validateUrl(
  url: URL,
  allowedHosts?: string[],
): Promise<void> {
  if (url.protocol !== 'https:') {
    throw AppError.badRequest(
      'Only HTTPS URLs are allowed',
      'SSRF_BLOCKED',
    );
  }

  // Prevent credential smuggling / confusing URLs.
  if (url.username || url.password) {
    throw AppError.badRequest(
      'URLs containing credentials are not allowed',
      'SSRF_BLOCKED',
    );
  }

  // Fragments are meaningless for server-side HTTP fetching.
  if (url.hash) {
    throw AppError.badRequest(
      'URL fragments are not allowed',
      'SSRF_BLOCKED',
    );
  }

  const hostname = normalizeHost(url.hostname);

  if (!hostAllowed(hostname, allowedHosts)) {
    throw AppError.badRequest(
      `Host not in allowlist: ${hostname}`,
      'SSRF_BLOCKED',
    );
  }

  await resolveAndValidateHost(hostname);
}

export async function assertRemoteUrlAllowed(
  rawUrl: string,
  opts: Pick<SecureFetchOptions, 'allowedHosts'> = {},
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.badRequest('Invalid URL', 'SSRF_BLOCKED');
  }

  await validateUrl(url, opts.allowedHosts);

  return url;
}

async function fetchWithTimeout(
  url: URL,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw AppError.badRequest(
        'Remote request timed out',
        'SSRF_TIMEOUT',
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function secureDownloadToFile(
  rawUrl: string,
  destPath: string,
  opts: SecureFetchOptions = {},
): Promise<void> {
  const maxRedirects = Math.max(
    0,
    opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
  );

  const connectTimeoutMs = Math.max(
    1_000,
    opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
  );

  const totalTimeoutMs = Math.max(
    connectTimeoutMs,
    opts.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
  );

  const maxBytes = Math.max(
    1,
    opts.maxBytes ?? DEFAULT_MAX_BYTES,
  );

  let currentUrl: URL;

  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw AppError.badRequest('Invalid URL', 'SSRF_BLOCKED');
  }

  const deadline = Date.now() + totalTimeoutMs;

  let response: Response | undefined;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await validateUrl(currentUrl, opts.allowedHosts);

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      throw AppError.badRequest(
        'Remote download timed out',
        'SSRF_TIMEOUT',
      );
    }

    response = await fetchWithTimeout(
      currentUrl,
      Math.min(connectTimeoutMs, remaining),
    );

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location = response.headers.get('location');

      if (!location) {
        throw AppError.badRequest(
          'Redirect missing Location header',
          'SSRF_BLOCKED',
        );
      }

      if (hop >= maxRedirects) {
        throw AppError.badRequest(
          'Too many redirects',
          'SSRF_BLOCKED',
        );
      }

      let redirectedUrl: URL;

      try {
        redirectedUrl = new URL(location, currentUrl);
      } catch {
        throw AppError.badRequest(
          'Invalid redirect URL',
          'SSRF_BLOCKED',
        );
      }

      // Validate the NEXT URL before following it.
      await validateUrl(
        redirectedUrl,
        opts.allowedHosts,
      );

      currentUrl = redirectedUrl;
      continue;
    }

    break;
  }

  if (!response) {
    throw AppError.badRequest(
      'Remote resource could not be fetched',
      'SSRF_BLOCKED',
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download remote resource: ${response.status}`,
    );
  }

  if (opts.allowedContentTypePrefixes?.length) {
    const contentType = (
      response.headers.get('content-type') || ''
    ).toLowerCase();

    const allowed = opts.allowedContentTypePrefixes.some(
      (prefix) => contentType.startsWith(prefix.toLowerCase()),
    );

    if (!allowed) {
      throw AppError.badRequest(
        `Unexpected content-type: ${contentType || 'unknown'}`,
        'REMOTE_CONTENT_TYPE_INVALID',
      );
    }
  }

  const contentLengthHeader =
    response.headers.get('content-length');

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0
    ) {
      throw AppError.badRequest(
        'Invalid remote content length',
        'REMOTE_SIZE_INVALID',
      );
    }

    if (contentLength > maxBytes) {
      throw AppError.badRequest(
        'Remote resource exceeds maximum allowed size',
        'REMOTE_SIZE_EXCEEDED',
      );
    }
  }

  const body = response.body;

  if (!body) {
    throw new Error('Empty response body');
  }

  await fs.mkdir(path.dirname(destPath), {
    recursive: true,
  });

  const nodeReadable = Readable.fromWeb(body as any);

  let received = 0;

  const limiter = new Readable({
    read() {},
  });

  nodeReadable.on('data', (chunk: Buffer) => {
    received += chunk.length;

    if (received > maxBytes) {
      nodeReadable.destroy(
        new Error(
          'Remote resource exceeded maximum allowed size',
        ),
      );
      return;
    }

    limiter.push(chunk);
  });

  nodeReadable.on('end', () => {
    limiter.push(null);
  });

  nodeReadable.on('error', (error) => {
    limiter.destroy(error);
  });

  const timeout = setTimeout(() => {
    nodeReadable.destroy(
      new Error('Remote download exceeded timeout'),
    );
  }, Math.max(0, deadline - Date.now()));

  try {
    await pipeline(
      limiter,
      createWriteStream(destPath, {
        flags: 'wx',
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function secureDownloadToBuffer(
  rawUrl: string,
  opts: SecureFetchOptions = {},
): Promise<Buffer> {
  const maxBytes =
    opts.maxBytes ?? 25 * 1024 * 1024;

  const tmpPath = path.join(
    os.tmpdir(),
    `secure-fetch-${crypto.randomBytes(16).toString('hex')}`,
  );

  try {
    await secureDownloadToFile(
      rawUrl,
      tmpPath,
      {
        ...opts,
        maxBytes,
      },
    );

    return await fs.readFile(tmpPath);
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Best effort cleanup.
    }
  }
}

/**
 * Approved Google hosts used by the video provider.
 *
 * Keep this exact-host allowlist. Do not replace it with a wildcard.
 */
export const GOOGLE_PROVIDER_HOSTS = [
  'generativelanguage.googleapis.com',
  'storage.googleapis.com',
] as const;