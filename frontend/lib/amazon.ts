/**
 * Parse common Amazon product URL shapes and extract ASIN / ISBN-like ids.
 *
 * Supported patterns (non-exhaustive):
 * - https://www.amazon.com/dp/B0XXXXXXX
 * - https://www.amazon.com/gp/product/B0XXXXXXX
 * - https://www.amazon.com/.../dp/B0XXXXXXX/...
 * - https://www.amazon.com/...?asin=B0XXXXXXX
 * - ISBN-10 / ISBN-13 sometimes appear as the "ASIN" for paper books
 *   (e.g. /dp/0143127551 or /dp/9780143127550)
 */

export type AmazonParseResult = {
  asin?: string;
  isbn?: string;
};

const ASIN_RE = /(?:\/(?:dp|gp\/product|product)\/|asin=)([A-Z0-9]{10})\b/i;
const ISBN13_RE = /\b(978|979)\d{10}\b/;
const ISBN10_RE = /\b(\d{9}[\dXx])\b/;

export function parseAmazonUrl(url: string): AmazonParseResult {
  const trimmed = url.trim();
  if (!trimmed) return {};

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // keep original
  }

  const result: AmazonParseResult = {};

  const asinMatch = decoded.match(ASIN_RE);
  if (asinMatch) {
    const id = asinMatch[1].toUpperCase();
    result.asin = id;

    // Paper books often use ISBN-10 as the ASIN; ISBN-13 can also appear in the path.
    if (/^\d{9}[\dX]$/i.test(id)) {
      result.isbn = id.toUpperCase().replace(/x$/i, "X");
    }
  }

  // Prefer explicit ISBN-13 if present anywhere in the URL
  const isbn13 = decoded.match(ISBN13_RE);
  if (isbn13) {
    result.isbn = isbn13[0];
  } else if (!result.isbn) {
    // Fall back to ISBN-10 only when we already have a numeric ASIN-looking id
    // or the URL path clearly contains one that is not a pure Amazon B0… ASIN.
    const isbn10 = decoded.match(ISBN10_RE);
    if (isbn10 && !/^B0/i.test(isbn10[1])) {
      result.isbn = isbn10[1].toUpperCase().replace(/x$/i, "X");
    }
  }

  return result;
}