import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
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
  allowedHosts?: readonly string[];
  maxRedirects?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
  allowedContentTypePrefixes?: string[];
}

interface ResolvedHost {
  hostname: string;
  address: string;
  family: 4 | 6;
}

function isDisallowedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (p) => !Number.isInteger(p) || p < 0 || p > 255
    )
  ) {
    return true;
  }

  const [a, b, c] = parts;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;

  return false;
}

function isDisallowedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower === '::' || lower === '::1') {
    return true;
  }

  // IPv4-mapped IPv6.
  const mapped = lower.match(
    /^::ffff:(\d+\.\d+\.\d+\.\d+)$/
  );

  if (mapped) {
    return isDisallowedIPv4(mapped[1]);
  }

  // IPv4-compatible IPv6.
  const compatible = lower.match(
    /^::(\d+\.\d+\.\d+\.\d+)$/
  );

  if (compatible) {
    return isDisallowedIPv4(compatible[1]);
  }

  // Unique-local fc00::/7.
  if (/^f[cd]/.test(lower)) {
    return true;
  }

  // Link-local fe80::/10.
  if (/^fe[89ab]/.test(lower)) {
    return true;
  }

  // Multicast ff00::/8.
  if (lower.startsWith('ff')) {
    return true;
  }

  return false;
}

function isDisallowedIP(ip: string): boolean {
  const family = net.isIP(ip);

  if (family === 4) {
    return isDisallowedIPv4(ip);
  }

  if (family === 6) {
    return isDisallowedIPv6(ip);
  }

  // Fail closed.
  return true;
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/\.$/, '').toLowerCase();
}

function hostAllowed(
  hostname: string,
  allowedHosts?: readonly string[],
): boolean {
  if (!allowedHosts?.length) {
    return true;
  }

  const host = normalizeHost(hostname);

  return allowedHosts.some(
    (allowed) => host === normalizeHost(allowed),
  );
}

async function resolveAndValidateHost(
  hostname: string,
): Promise<ResolvedHost[]> {
  const host = normalizeHost(hostname);

  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw AppError.badRequest(
      'Refusing to fetch from local host',
      'SSRF_BLOCKED',
    );
  }

  // Direct IP URL.
  if (net.isIP(host)) {
    if (isDisallowedIP(host)) {
      throw AppError.badRequest(
        `Refusing to fetch from disallowed address: ${host}`,
        'SSRF_BLOCKED',
      );
    }

    return [
      {
        hostname: host,
        address: host,
        family: net.isIP(host) as 4 | 6,
      },
    ];
  }

  let addresses: ResolvedHost[] = [];

  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(host).catch(() => [] as string[]),
      dns.resolve6(host).catch(() => [] as string[]),
    ]);

    addresses = [
      ...v4.map((address) => ({
        hostname: host,
        address,
        family: 4 as const,
      })),
      ...v6.map((address) => ({
        hostname: host,
        address,
        family: 6 as const,
      })),
    ];
  } catch (error) {
    logger.warn('SSRF DNS resolution failed', {
      hostname: host,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });

    throw AppError.badRequest(
      'Failed to resolve remote host',
      'SSRF_DNS_FAILED',
    );
  }

  if (!addresses.length) {
    throw AppError.badRequest(
      'Remote host did not resolve',
      'SSRF_DNS_FAILED',
    );
  }

  // Every DNS result must be safe.
  for (const resolved of addresses) {
    if (isDisallowedIP(resolved.address)) {
      throw AppError.badRequest(
        'Remote host resolves to a disallowed address',
        'SSRF_BLOCKED',
      );
    }
  }

  return addresses;
}

async function validateUrl(
  url: URL,
  allowedHosts?: readonly string[],
): Promise<ResolvedHost[]> {
  if (url.protocol !== 'https:') {
    throw AppError.badRequest(
      'Only HTTPS URLs are allowed',
      'SSRF_BLOCKED',
    );
  }

  // Prevent userinfo-based URL confusion.
  if (url.username || url.password) {
    throw AppError.badRequest(
      'URLs containing credentials are not allowed',
      'SSRF_BLOCKED',
    );
  }

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

  return resolveAndValidateHost(hostname);
}

export async function assertRemoteUrlAllowed(
  rawUrl: string,
  opts: Pick<SecureFetchOptions, 'allowedHosts'> = {},
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.badRequest(
      'Invalid URL',
      'SSRF_BLOCKED',
    );
  }

  await validateUrl(url, opts.allowedHosts);

  return url;
}

interface PinnedResponse {
  statusCode: number;
  headers: Record<
    string,
    string | string[] | undefined
  >;
  body: Readable;
}

function getHeader(
  headers: PinnedResponse['headers'],
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

/**
 * Makes the actual TLS connection to the IP address that was
 * already resolved and validated.
 *
 * This is important for SSRF protection:
 *
 *     resolve -> validate IP -> connect to SAME IP
 *
 * rather than:
 *
 *     resolve -> validate IP -> fetch hostname -> DNS lookup again
 *
 * The latter can be vulnerable to DNS rebinding.
 */
function requestPinned(
  url: URL,
  resolved: ResolvedHost,
  timeoutMs: number,
): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const req = https.request(
      {
        protocol: 'https:',

        // IMPORTANT:
        // Connect directly to the validated IP.
        hostname: resolved.address,

        port: url.port
          ? Number(url.port)
          : 443,

        path: `${url.pathname}${url.search}`,

        method: 'GET',

        // Preserve hostname for TLS/SNI.
        servername: resolved.hostname,

        family: resolved.family,

        // Prevent Node from performing another DNS lookup.
        lookup: (
          _hostname,
          _options,
          callback,
        ) => {
          callback(null, [{ address: resolved.address, family: resolved.family }]);
        },

        headers: {
          Host: url.host,
          Accept: '*/*',
        },

        rejectUnauthorized: true,
      },
      (res) => {
        if (settled) {
          return;
        }

        settled = true;

        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error('Remote request timed out'),
      );
    });

    req.once('error', fail);

    req.end();
  });
}

export async function secureDownloadToFile(
  rawUrl: string,
  destPath: string,
  opts: SecureFetchOptions = {},
): Promise<void> {
  const maxRedirects = Math.max(
    0,
    opts.maxRedirects ??
      DEFAULT_MAX_REDIRECTS,
  );

  const connectTimeoutMs = Math.max(
    1_000,
    opts.connectTimeoutMs ??
      DEFAULT_CONNECT_TIMEOUT_MS,
  );

  const totalTimeoutMs = Math.max(
    connectTimeoutMs,
    opts.totalTimeoutMs ??
      DEFAULT_TOTAL_TIMEOUT_MS,
  );

  const maxBytes = Math.max(
    1,
    opts.maxBytes ?? DEFAULT_MAX_BYTES,
  );

  let currentUrl: URL;

  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw AppError.badRequest(
      'Invalid URL',
      'SSRF_BLOCKED',
    );
  }

  const deadline =
    Date.now() + totalTimeoutMs;

  let response: PinnedResponse | undefined;

  for (
    let hop = 0;
    hop <= maxRedirects;
    hop++
  ) {
    /*
     * Resolve + validate the hostname.
     *
     * The returned IP is then passed directly to
     * requestPinned(), preventing DNS rebinding.
     */
    const resolved = await validateUrl(
      currentUrl,
      opts.allowedHosts,
    );

    const remaining =
      deadline - Date.now();

    if (remaining <= 0) {
      throw AppError.badRequest(
        'Remote download timed out',
        'SSRF_TIMEOUT',
      );
    }

    /*
     * Use the first validated address.
     *
     * If that address fails, fail closed instead of
     * resolving the hostname again to potentially
     * obtain a different address.
     */
    response = await requestPinned(
      currentUrl,
      resolved[0],
      Math.min(
        connectTimeoutMs,
        remaining,
      ),
    );

    if (
      response.statusCode >= 300 &&
      response.statusCode < 400
    ) {
      const location = getHeader(
        response.headers,
        'location',
      );

      response.body.resume();

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

      try {
        currentUrl = new URL(
          location,
          currentUrl,
        );
      } catch {
        throw AppError.badRequest(
          'Invalid redirect URL',
          'SSRF_BLOCKED',
        );
      }

      /*
       * Validate redirected URL before making
       * the next network request.
       */
      await validateUrl(
        currentUrl,
        opts.allowedHosts,
      );

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

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    response.body.resume();

    throw new Error(
      `Failed to download remote resource: ${response.statusCode}`,
    );
  }

  if (
    opts.allowedContentTypePrefixes?.length
  ) {
    const contentType = (
      getHeader(
        response.headers,
        'content-type',
      ) || ''
    ).toLowerCase();

    const allowed =
      opts.allowedContentTypePrefixes.some(
        (prefix) =>
          contentType.startsWith(
            prefix.toLowerCase(),
          ),
      );

    if (!allowed) {
      response.body.resume();

      throw AppError.badRequest(
        `Unexpected content-type: ${
          contentType || 'unknown'
        }`,
        'REMOTE_CONTENT_TYPE_INVALID',
      );
    }
  }

  const contentLengthHeader =
    getHeader(
      response.headers,
      'content-length',
    );

  if (contentLengthHeader) {
    const contentLength =
      Number(contentLengthHeader);

    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0
    ) {
      response.body.resume();

      throw AppError.badRequest(
        'Invalid remote content length',
        'REMOTE_SIZE_INVALID',
      );
    }

    if (contentLength > maxBytes) {
      response.body.resume();

      throw AppError.badRequest(
        'Remote resource exceeds maximum allowed size',
        'REMOTE_SIZE_EXCEEDED',
      );
    }
  }

  await fs.mkdir(
    path.dirname(destPath),
    {
      recursive: true,
    },
  );

  let received = 0;

  const limited = new Readable({
    read() {},
  });

  const source = response.body;

  source.on(
    'data',
    (chunk: Buffer) => {
      received += chunk.length;

      if (received > maxBytes) {
        source.destroy(
          new Error(
            'Remote resource exceeded maximum allowed size',
          ),
        );

        return;
      }

      limited.push(chunk);
    },
  );

  source.on('end', () => {
    limited.push(null);
  });

  source.on(
    'error',
    (error) => {
      limited.destroy(error);
    },
  );

  const timeout = setTimeout(() => {
    source.destroy(
      new Error(
        'Remote download exceeded timeout',
      ),
    );
  }, Math.max(0, deadline - Date.now()));

  try {
    await pipeline(
      limited,
      createWriteStream(
        destPath,
        {
          flags: 'wx',
        },
      ),
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
    opts.maxBytes ??
    25 * 1024 * 1024;

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

    return await fs.readFile(
      tmpPath,
    );
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Best-effort cleanup.
    }
  }
}

/**
 * Known Google hosts legitimately used
 * by Gemini/Veo.
 */
export const GOOGLE_PROVIDER_HOSTS = [
  'generativelanguage.googleapis.com',
  'storage.googleapis.com',
] as const;
