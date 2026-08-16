/**
 * Resolve a real book cover image URL.
 *
 * Priority:
 * 1. Explicit coverImageUrl from client
 * 2. Scrape og:image / main product image from Amazon or Goodreads URL
 *    (matches the exact listing the user linked) — cached via scrapeCache
 * 3. Direct Amazon ASIN image URL
 * 4. Google Books / Open Library by ISBN or ASIN / title (fallback)
 *
 * Used when creating/updating a book so BookCard can show the correct cover.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { scrapeCache } from "../services/scrape-cache.service";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/** Cover scrape results are stable; cache longer than review scrapes. */
const COVER_CACHE_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

type CachedCover = { url: string };

function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

function isLikelyCoverUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u.startsWith("http") && !u.startsWith("//")) return false;
  // Skip tiny icons, tracking pixels, sprites
  if (/\.(svg|gif)(\?|$)/i.test(u)) return false;
  if (/sprite|icon|logo|pixel|1x1|spacer/i.test(u)) return false;
  return true;
}

/** Prefer larger Amazon image variants when possible. */
function upgradeAmazonImageUrl(url: string): string {
  return url
    .replace(/\._[A-Z0-9]+_\./g, ".") // strip size tokens like ._SX300_.
    .replace(/\._AC_[A-Z0-9_]+_\./g, ".")
    .replace(/\._SL\d+_\./g, ".")
    .replace(/\._UX\d+_\./g, ".")
    .replace(/\._UY\d+_\./g, ".");
}

async function scrapeCoverFromPage(
  pageUrl: string,
  source: "amazon" | "goodreads"
): Promise<string | undefined> {
  try {
    const { data } = await axios.get<string>(pageUrl, {
      timeout: 12000,
      headers: REQUEST_HEADERS,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const $ = cheerio.load(data);

    const candidates: string[] = [];

    // 1. Open Graph / Twitter card (most reliable for the listing image)
    const og =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:secure_url"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");
    if (og) candidates.push(og.trim());

    if (source === "goodreads") {
      const gr =
        $("#coverImage").attr("src") ||
        $('img[id="coverImage"]').attr("src") ||
        $(".BookCover__image img").attr("src") ||
        $('img.ResponsiveImage[src*="goodreads"]').attr("src") ||
        $('img[src*="i.gr-assets.com"]').first().attr("src");
      if (gr) candidates.push(gr.trim());
    }

    if (source === "amazon") {
      const landing =
        $("#landingImage").attr("src") ||
        $("#landingImage").attr("data-old-hires") ||
        $("#imgBlkFront").attr("src") ||
        $("#imgBlkFront").attr("data-old-hires") ||
        $("#main-image").attr("src") ||
        $("img[data-a-dynamic-image]").first().attr("src");
      if (landing) candidates.push(landing.trim());

      // data-a-dynamic-image is a JSON map of url -> [w,h]; pick largest
      const dyn = $("img[data-a-dynamic-image]").first().attr("data-a-dynamic-image");
      if (dyn) {
        try {
          const map = JSON.parse(dyn) as Record<string, [number, number]>;
          const sorted = Object.entries(map).sort(
            (a, b) => (b[1][0] * b[1][1] || 0) - (a[1][0] * a[1][1] || 0)
          );
          if (sorted[0]?.[0]) candidates.push(sorted[0][0]);
        } catch {
          // ignore
        }
      }
    }

    for (const raw of candidates) {
      if (!isLikelyCoverUrl(raw)) continue;
      let url = raw.startsWith("//") ? `https:${raw}` : raw;
      if (source === "amazon") url = upgradeAmazonImageUrl(url);
      url = url.replace(/^http:\/\//i, "https://");
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Scrape cover from Amazon/Goodreads with memory+Redis cache.
 * Cache key is the page URL so the same listing is not re-fetched.
 */
async function getCachedScrapedCover(
  pageUrl: string,
  source: "amazon" | "goodreads"
): Promise<string | undefined> {
  const cacheSource = `cover-${source}`;
  const identity = pageUrl.trim();

  const cached = await scrapeCache.get<CachedCover>(cacheSource, identity);
  if (cached?.url && isLikelyCoverUrl(cached.url)) {
    return cached.url;
  }

  const scraped = await scrapeCoverFromPage(pageUrl, source);
  if (scraped) {
    await scrapeCache.set(cacheSource, identity, { url: scraped }, COVER_CACHE_TTL_SEC);
    return scraped;
  }
  return undefined;
}

/** Direct Amazon image URL from ASIN (works for many retail listings). */
function amazonAsinCover(asin: string): string {
  const id = asin.trim().toUpperCase();
  return `https://m.media-amazon.com/images/P/${id}.01.LZZZZZZZ.jpg`;
}

function openLibraryIsbnCover(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${normalizeIsbn(isbn)}-L.jpg`;
}

async function openLibrarySearchCover(query: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`,
      { headers: { Accept: "application/json", "User-Agent": "BookMarketingOS/1.0" } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      docs?: Array<{ cover_i?: number; isbn?: string[] }>;
    };
    const doc = data.docs?.[0];
    if (doc?.cover_i) {
      return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }
    const isbn = doc?.isbn?.[0];
    if (isbn) return openLibraryIsbnCover(isbn);
    return undefined;
  } catch {
    return undefined;
  }
}

async function googleBooksCover(isbn: string): Promise<string | undefined> {
  try {
    const q = encodeURIComponent(`isbn:${normalizeIsbn(isbn)}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      items?: Array<{
        volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } };
      }>;
    };
    const links = json.items?.[0]?.volumeInfo?.imageLinks;
    const raw = links?.thumbnail || links?.smallThumbnail;
    if (!raw) return undefined;
    return raw
      .replace("http://", "https://")
      .replace("&edge=curl", "")
      .replace("zoom=1", "zoom=2");
  } catch {
    return undefined;
  }
}

export async function resolveCoverImageUrl(opts: {
  coverImageUrl?: string | null;
  amazonUrl?: string | null;
  goodreadsUrl?: string | null;
  isbn?: string | null;
  asin?: string | null;
  title?: string | null;
}): Promise<string | undefined> {
  if (opts.coverImageUrl?.trim()) {
    return opts.coverImageUrl.trim();
  }

  const amazonUrl = opts.amazonUrl?.trim();
  const goodreadsUrl = opts.goodreadsUrl?.trim();
  const isbn = opts.isbn?.trim();
  const asin = opts.asin?.trim();
  const title = opts.title?.trim();

  // Prefer the exact image from the page the user linked (cached)
  if (amazonUrl && /amazon\./i.test(amazonUrl)) {
    const scraped = await getCachedScrapedCover(amazonUrl, "amazon");
    if (scraped) return scraped;
  }

  if (goodreadsUrl && /goodreads\.com/i.test(goodreadsUrl)) {
    const scraped = await getCachedScrapedCover(goodreadsUrl, "goodreads");
    if (scraped) return scraped;
  }

  // ASIN direct image (deterministic URL — no scrape needed)
  if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
    return amazonAsinCover(asin);
  }

  if (isbn) {
    const g = await googleBooksCover(isbn);
    if (g) return g;
    return openLibraryIsbnCover(isbn);
  }

  if (asin) {
    const byAsin = await openLibrarySearchCover(asin);
    if (byAsin) return byAsin;
  }

  if (title) {
    const byTitle = await openLibrarySearchCover(title);
    if (byTitle) return byTitle;
  }

  return undefined;
}