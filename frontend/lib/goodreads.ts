/**
 * Parse Goodreads book URLs and extract book id / ISBN when present in the path.
 *
 * Supported patterns:
 * - https://www.goodreads.com/book/show/12345
 * - https://www.goodreads.com/book/show/12345.Book_Title
 * - https://www.goodreads.com/book/show/12345-book-title
 * - https://www.goodreads.com/book/isbn/9780143127550
 * - https://www.goodreads.com/book/isbn/0143127551
 */

export type GoodreadsParseResult = {
  goodreadsId?: string;
  isbn?: string;
};

const SHOW_RE = /goodreads\.com\/book\/show\/(\d+)/i;
const ISBN_PATH_RE = /goodreads\.com\/book\/isbn\/([0-9Xx-]{10,17})/i;
const ISBN13_RE = /\b(978|979)\d{10}\b/;
const ISBN10_RE = /\b(\d{9}[\dXx])\b/;

export function parseGoodreadsUrl(url: string): GoodreadsParseResult {
  const trimmed = url.trim();
  if (!trimmed) return {};

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // keep original
  }

  const result: GoodreadsParseResult = {};

  const showMatch = decoded.match(SHOW_RE);
  if (showMatch) {
    result.goodreadsId = showMatch[1];
  }

  const isbnPath = decoded.match(ISBN_PATH_RE);
  if (isbnPath) {
    const raw = isbnPath[1].replace(/-/g, "");
    result.isbn = raw.toUpperCase().replace(/x$/i, "X");
  }

  if (!result.isbn) {
    const isbn13 = decoded.match(ISBN13_RE);
    if (isbn13) {
      result.isbn = isbn13[0];
    } else {
      const isbn10 = decoded.match(ISBN10_RE);
      if (isbn10) {
        result.isbn = isbn10[1].toUpperCase().replace(/x$/i, "X");
      }
    }
  }

  return result;
}