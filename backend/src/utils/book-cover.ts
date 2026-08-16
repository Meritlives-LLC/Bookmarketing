/**
 * Resolve a real book cover image URL from ISBN or ASIN.
 * Used when creating/updating a book so BookCard can show the cover.
 */

function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
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
  isbn?: string | null;
  asin?: string | null;
  title?: string | null;
}): Promise<string | undefined> {
  if (opts.coverImageUrl?.trim()) {
    return opts.coverImageUrl.trim();
  }

  const isbn = opts.isbn?.trim();
  const asin = opts.asin?.trim();
  const title = opts.title?.trim();

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