/**
 * Resolve a real book cover image URL safely.
 *
 * Supported page sources:
 * - Amazon
 * - Goodreads
 *
 * Remote page fetching is always performed through the centralized
 * SSRF-protected downloader.
 */

import * as cheerio from "cheerio";
import { scrapeCache } from "../services/scrape-cache.service";
import { cloudinaryService } from "../services/cloudinary.service";
import { logger } from "./logger";
import {
  secureDownloadToBuffer,
  assertRemoteUrlAllowed,
} from "./secure-remote-fetch";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.8",
};

const COVER_CACHE_TTL_SEC = 60 * 60 * 24 * 7;
const CLOUDINARY_CACHE_TTL_SEC = 60 * 60 * 24 * 7;

const AMAZON_PAGE_HOSTS = [
  "amazon.com",
  "www.amazon.com",
  "amazon.co.uk",
  "www.amazon.co.uk",
  "amazon.ca",
  "www.amazon.ca",
  "amazon.com.au",
  "www.amazon.com.au",
  "amazon.de",
  "www.amazon.de",
  "amazon.fr",
  "www.amazon.fr",
  "amazon.es",
  "www.amazon.es",
  "amazon.it",
  "www.amazon.it",
  "amazon.co.jp",
  "www.amazon.co.jp",
  "amazon.in",
  "www.amazon.in",
  "amazon.com.br",
  "www.amazon.com.br",
  "amazon.com.mx",
  "www.amazon.com.mx",
  "amazon.nl",
  "www.amazon.nl",
  "amazon.se",
  "www.amazon.se",
  "amazon.pl",
  "www.amazon.pl",
];

const GOODREADS_PAGE_HOSTS = [
  "goodreads.com",
  "www.goodreads.com",
];

const AMAZON_IMAGE_HOSTS = [
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images.amazon.com",
];

const GOODREADS_IMAGE_HOSTS = [
  "i.gr-assets.com",
  "images.gr-assets.com",
];

const GENERIC_COVER_HOSTS = [
  "covers.openlibrary.org",
  "www.googleapis.com",
];

type CachedCover = {
  url: string;
};

type CachedCloudinary = {
  url: string;
};

function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

function isLikelyCoverUrl(
  url: string | undefined | null,
): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const value = url.trim();

  if (!/^https:\/\//i.test(value)) {
    return false;
  }

  if (/\.(svg|gif)(\?|$)/i.test(value)) {
    return false;
  }

  if (/sprite|icon|logo|pixel|1x1|spacer/i.test(value)) {
    return false;
  }

  return true;
}

function normalizeHost(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function isAllowedExactHost(
  hostname: string,
  allowedHosts: readonly string[],
): boolean {
  const normalized = normalizeHost(hostname);

  return allowedHosts.some(
    (host) => normalizeHost(host) === normalized,
  );
}

function parseAllowedUrl(
  raw: string,
  allowedHosts: readonly string[],
): URL | undefined {
  try {
    const url = new URL(raw);

    if (url.protocol !== "https:") {
      return undefined;
    }

    if (url.username || url.password) {
      return undefined;
    }

    if (!isAllowedExactHost(url.hostname, allowedHosts)) {
      return undefined;
    }

    return url;
  } catch {
    return undefined;
  }
}

function upgradeAmazonImageUrl(url: string): string {
  return url
    .replace(/\\._[A-Z0-9]+_\\./g, ".")
    .replace(/\\._AC_[A-Z0-9_]+_\\./g, ".")
    .replace(/\\._SL\d+_\\./g, ".")
    .replace(/\\._UX\d+_\\./g, ".")
    .replace(/\\._UY\d+_\\./g, ".");
}

async function scrapeCoverFromPage(
  pageUrl: string,
  source: "amazon" | "goodreads",
): Promise<string | undefined> {
  const allowedPageHosts =
    source === "amazon"
      ? AMAZON_PAGE_HOSTS
      : GOODREADS_PAGE_HOSTS;

  const validatedPageUrl = parseAllowedUrl(
    pageUrl,
    allowedPageHosts,
  );

  if (!validatedPageUrl) {
    logger.warn("Rejected non-approved book source URL", {
      source,
      pageUrl,
    });

    return undefined;
  }

  try {
    /*
     * The URL is now:
     * 1. HTTPS only
     * 2. exact-host allowlisted
     *
     * The downloader additionally:
     * - resolves DNS
     * - blocks private/reserved addresses
     * - pins the validated IP
     * - revalidates redirects
     * - limits response size
     * - limits request time
     */
    const htmlBuffer =
      await secureDownloadToBuffer(
        validatedPageUrl.toString(),
        {
          allowedHosts: [
            ...allowedPageHosts,
          ],
          maxBytes: 5 * 1024 * 1024,
          totalTimeoutMs: 15_000,
          maxRedirects: 3,
          allowedContentTypePrefixes: [
            "text/html",
            "application/xhtml+xml",
          ],
        },
      );

    const html = htmlBuffer.toString(
      "utf8",
    );

    const $ = cheerio.load(html);

    const candidates: string[] = [];

    const og =
      $('meta[property="og:image"]').attr(
        "content",
      ) ||
      $(
        'meta[property="og:image:secure_url"]',
      ).attr("content") ||
      $('meta[name="twitter:image"]').attr(
        "content",
      );

    if (og) {
      candidates.push(og.trim());
    }

    if (source === "goodreads") {
      const cover =
        $("#coverImage").attr("src") ||
        $('img[id="coverImage"]').attr(
          "src",
        ) ||
        $(".BookCover__image img").attr(
          "src",
        ) ||
        $('img.ResponsiveImage[src*="goodreads"]')
          .attr("src") ||
        $('img[src*="i.gr-assets.com"]')
          .first()
          .attr("src");

      if (cover) {
        candidates.push(cover.trim());
      }
    }

    if (source === "amazon") {
      const landing =
        $("#landingImage").attr("src") ||
        $("#landingImage").attr(
          "data-old-hires",
        ) ||
        $("#imgBlkFront").attr("src") ||
        $("#imgBlkFront").attr(
          "data-old-hires",
        ) ||
        $("#main-image").attr("src") ||
        $('img[data-a-dynamic-image]')
          .first()
          .attr("src");

      if (landing) {
        candidates.push(landing.trim());
      }

      const dynamic =
        $('img[data-a-dynamic-image]')
          .first()
          .attr("data-a-dynamic-image");

      if (dynamic) {
        try {
          const map = JSON.parse(
            dynamic,
          ) as Record<
            string,
            [number, number]
          >;

          const sorted =
            Object.entries(map).sort(
              (a, b) =>
                (b[1][0] * b[1][1] || 0) -
                (a[1][0] * a[1][1] || 0),
            );

          if (sorted[0]?.[0]) {
            candidates.push(
              sorted[0][0],
            );
          }
        } catch {
          // Ignore malformed Amazon metadata.
        }
      }
    }

    for (const raw of candidates) {
      if (!isLikelyCoverUrl(raw)) {
        continue;
      }

      let url = raw.trim();

      if (source === "amazon") {
        url = upgradeAmazonImageUrl(url);

        const parsed = parseAllowedUrl(
          url,
          AMAZON_IMAGE_HOSTS,
        );

        if (!parsed) {
          continue;
        }

        return parsed.toString();
      }

      const parsed = parseAllowedUrl(
        url,
        GOODREADS_IMAGE_HOSTS,
      );

      if (!parsed) {
        continue;
      }

      return parsed.toString();
    }

    return undefined;
  } catch (error) {
    logger.warn(
      "Secure book cover scrape failed",
      {
        source,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    return undefined;
  }
}

async function getCachedScrapedCover(
  pageUrl: string,
  source: "amazon" | "goodreads",
): Promise<string | undefined> {
  const cacheSource = `cover-${source}`;
  const identity = pageUrl.trim();

  const cached =
    await scrapeCache.get<CachedCover>(
      cacheSource,
      identity,
    );

  if (
    cached?.url &&
    isLikelyCoverUrl(cached.url)
  ) {
    return cached.url;
  }

  const scraped =
    await scrapeCoverFromPage(
      identity,
      source,
    );

  if (scraped) {
    await scrapeCache.set(
      cacheSource,
      identity,
      { url: scraped },
      COVER_CACHE_TTL_SEC,
    );

    return scraped;
  }

  return undefined;
}

function amazonAsinCover(
  asin: string,
): string {
  const id = asin
    .trim()
    .toUpperCase();

  return `https://m.media-amazon.com/images/P/${id}.01.LZZZZZZZ.jpg`;
}

function openLibraryIsbnCover(
  isbn: string,
): string {
  return `https://covers.openlibrary.org/b/isbn/${normalizeIsbn(
    isbn,
  )}-L.jpg`;
}

async function openLibrarySearchCover(
  query: string,
): Promise<string | undefined> {
  try {
    const url =
      `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query,
      )}&limit=1`;

    const dataBuffer =
      await secureDownloadToBuffer(
        url,
        {
          allowedHosts: [
            "openlibrary.org",
          ],
          maxBytes:
            512 * 1024,
          totalTimeoutMs:
            10_000,
          allowedContentTypePrefixes: [
            "application/json",
          ],
        },
      );

    const data =
      JSON.parse(
        dataBuffer.toString("utf8"),
      ) as {
        docs?: Array<{
          cover_i?: number;
          isbn?: string[];
        }>;
      };

    const doc = data.docs?.[0];

    if (doc?.cover_i) {
      return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }

    const isbn = doc?.isbn?.[0];

    if (isbn) {
      return openLibraryIsbnCover(
        isbn,
      );
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function googleBooksCover(
  isbn: string,
): Promise<string | undefined> {
  try {
    const url =
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        `isbn:${normalizeIsbn(isbn)}`,
      )}&maxResults=1`;

    const dataBuffer =
      await secureDownloadToBuffer(
        url,
        {
          allowedHosts: [
            "www.googleapis.com",
          ],
          maxBytes:
            512 * 1024,
          totalTimeoutMs:
            10_000,
          allowedContentTypePrefixes: [
            "application/json",
          ],
        },
      );

    const json =
      JSON.parse(
        dataBuffer.toString("utf8"),
      ) as {
        items?: Array<{
          volumeInfo?: {
            imageLinks?: {
              thumbnail?: string;
              smallThumbnail?: string;
            };
          };
        }>;
      };

    const links =
      json.items?.[0]?.volumeInfo
        ?.imageLinks;

    const raw =
      links?.thumbnail ||
      links?.smallThumbnail;

    if (!raw) {
      return undefined;
    }

    const normalized =
      raw
        .replace(/^http:\/\//i, "https://")
        .replace("&edge=curl", "")
        .replace("zoom=1", "zoom=2");

    const parsed = parseAllowedUrl(
      normalized,
      [
        "books.google.com",
        "books.googleusercontent.com",
      ],
    );

    return parsed?.toString();
  } catch {
    return undefined;
  }
}

async function toCloudinaryUrl(
  sourceUrl: string,
): Promise<string> {
  if (
    !cloudinaryService.isEnabled()
  ) {
    return sourceUrl;
  }

  const identity = sourceUrl.trim();

  const cached =
    await scrapeCache.get<CachedCloudinary>(
      "cover-cloudinary",
      identity,
    );

  if (
    cached?.url &&
    isLikelyCoverUrl(cached.url)
  ) {
    return cached.url;
  }

  try {
    /*
     * cloudinaryService.uploadRemote()
     * must itself call assertRemoteUrlAllowed().
     */
    const uploaded =
      await cloudinaryService.uploadRemote(
        identity,
      );

    if (uploaded) {
      await scrapeCache.set(
        "cover-cloudinary",
        identity,
        { url: uploaded },
        CLOUDINARY_CACHE_TTL_SEC,
      );

      return uploaded;
    }
  } catch (error) {
    logger.warn(
      "Cloudinary cover upload error",
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );
  }

  return sourceUrl;
}

async function resolveSourceCoverUrl(
  opts: {
    coverImageUrl?: string | null;
    amazonUrl?: string | null;
    goodreadsUrl?: string | null;
    isbn?: string | null;
    asin?: string | null;
    title?: string | null;
  },
): Promise<string | undefined> {
  if (opts.coverImageUrl?.trim()) {
    const supplied =
      opts.coverImageUrl.trim();

    /*
     * Client-supplied cover URLs must also
     * be HTTPS and publicly routable.
     */
    await assertRemoteUrlAllowed(
      supplied,
    );

    return supplied;
  }

  const amazonUrl =
    opts.amazonUrl?.trim();

  const goodreadsUrl =
    opts.goodreadsUrl?.trim();

  const isbn =
    opts.isbn?.trim();

  const asin =
    opts.asin?.trim();

  const title =
    opts.title?.trim();

  if (amazonUrl) {
    const scraped =
      await getCachedScrapedCover(
        amazonUrl,
        "amazon",
      );

    if (scraped) {
      return scraped;
    }
  }

  if (goodreadsUrl) {
    const scraped =
      await getCachedScrapedCover(
        goodreadsUrl,
        "goodreads",
      );

    if (scraped) {
      return scraped;
    }
  }

  if (
    asin &&
    /^[A-Z0-9]{10}$/i.test(asin)
  ) {
    return amazonAsinCover(asin);
  }

  if (isbn) {
    const google =
      await googleBooksCover(isbn);

    if (google) {
      return google;
    }

    return openLibraryIsbnCover(
      isbn,
    );
  }

  if (asin) {
    const byAsin =
      await openLibrarySearchCover(
        asin,
      );

    if (byAsin) {
      return byAsin;
    }
  }

  if (title) {
    const byTitle =
      await openLibrarySearchCover(
        title,
      );

    if (byTitle) {
      return byTitle;
    }
  }

  return undefined;
}

export async function resolveCoverImageUrl(
  opts: {
    coverImageUrl?: string | null;
    amazonUrl?: string | null;
    goodreadsUrl?: string | null;
    isbn?: string | null;
    asin?: string | null;
    title?: string | null;
  },
): Promise<string | undefined> {
  const source =
    await resolveSourceCoverUrl(opts);

  if (!source) {
    return undefined;
  }

  return toCloudinaryUrl(source);
}