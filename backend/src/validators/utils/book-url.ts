/**
 * Extract ASIN / ISBN / Goodreads id from public Amazon & Goodreads URLs.
 * Used on create/update so ids are stored even if the client did not send them.
 */

export type AmazonParseResult = {
  asin?: string;
  isbn?: string;
};

export type GoodreadsParseResult = {
  goodreadsId?: string;
  isbn?: string;
};

const ASIN_RE = /(?:\/(?:dp|gp\/product|product)\/|asin=)([A-Z0-9]{10})\b/i;
const ISBN13_RE = /\b(978|979)\d{10}\b/;
const ISBN10_RE = /\b(\d{9}[\dXx])\b/;
const GOODREADS_SHOW_RE = /goodreads\.com\/book\/show\/(\d+)/i;
const GOODREADS_ISBN_PATH_RE = /goodreads\.com\/book\/isbn\/([0-9Xx-]{10,17})/i;

function decodeSafe(url: string): string {
  try {
    return decodeURIComponent(url.trim());
  } catch {
    return url.trim();
  }
}

export function parseAmazonUrl(url: string): AmazonParseResult {
  const decoded = decodeSafe(url);
  if (!decoded) return {};

  const result: AmazonParseResult = {};

  const asinMatch = decoded.match(ASIN_RE);
  if (asinMatch) {
    const id = asinMatch[1].toUpperCase();
    result.asin = id;
    if (/^\d{9}[\dX]$/i.test(id)) {
      result.isbn = id.toUpperCase().replace(/x$/i, 'X');
    }
  }

  const isbn13 = decoded.match(ISBN13_RE);
  if (isbn13) {
    result.isbn = isbn13[0];
  } else if (!result.isbn) {
    const isbn10 = decoded.match(ISBN10_RE);
    if (isbn10 && !/^B0/i.test(isbn10[1])) {
      result.isbn = isbn10[1].toUpperCase().replace(/x$/i, 'X');
    }
  }

  return result;
}

export function parseGoodreadsUrl(url: string): GoodreadsParseResult {
  const decoded = decodeSafe(url);
  if (!decoded) return {};

  const result: GoodreadsParseResult = {};

  const showMatch = decoded.match(GOODREADS_SHOW_RE);
  if (showMatch) {
    result.goodreadsId = showMatch[1];
  }

  const isbnPath = decoded.match(GOODREADS_ISBN_PATH_RE);
  if (isbnPath) {
    result.isbn = isbnPath[1].replace(/-/g, '').toUpperCase().replace(/x$/i, 'X');
  }

  if (!result.isbn) {
    const isbn13 = decoded.match(ISBN13_RE);
    if (isbn13) {
      result.isbn = isbn13[0];
    } else {
      const isbn10 = decoded.match(ISBN10_RE);
      if (isbn10) {
        result.isbn = isbn10[1].toUpperCase().replace(/x$/i, 'X');
      }
    }
  }

  return result;
}

/** Merge client-provided book fields with ids parsed from amazonUrl / goodreadsUrl. */
export function enrichBookIdsFromUrls<T extends {
  amazonUrl?: string | null;
  goodreadsUrl?: string | null;
  asin?: string | null;
  isbn?: string | null;
}>(input: T): T {
  const amazon = input.amazonUrl ? parseAmazonUrl(input.amazonUrl) : {};
  const goodreads = input.goodreadsUrl ? parseGoodreadsUrl(input.goodreadsUrl) : {};

  return {
    ...input,
    asin: input.asin || amazon.asin || undefined,
    isbn: input.isbn || amazon.isbn || goodreads.isbn || undefined,
  };
}