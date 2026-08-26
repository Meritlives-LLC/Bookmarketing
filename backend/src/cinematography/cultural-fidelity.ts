/**
 * Cultural/geographic fidelity for scene prompts (see book-video hardening
 * requirements: African/foreign/historical settings must reflect the
 * actual place described in the book, not a generic or stereotyped
 * substitute for that country/region).
 *
 * This module does two things:
 *  1. Turns book-grounded location fields (country/city/region/
 *     culturalContext) into a natural-language clause for the visual
 *     prompt — using ONLY what was actually extracted from the text.
 *  2. Adds a small, generic set of negative-prompt terms as a technical
 *     safety net against the most common stereotype failure modes
 *     (safari/wildlife imagery, huts, "tribal" costuming, generic
 *     village tropes) whenever a location has a real country/region on
 *     record but the book's own culturalContext doesn't call for them.
 *     This is a backstop alongside the extraction-time instructions, not
 *     a replacement for them — it never adds invented positive detail,
 *     only guards against the model defaulting to stock imagery.
 */

export interface LocationCulturalInfo {
  name?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  culturalContext?: string | null;
}

/** Stock stereotype terms to suppress when they aren't book-supported. */
const GENERIC_STEREOTYPE_NEGATIVES = [
  'safari animals',
  'unrelated wildlife',
  'generic mud hut village',
  'stereotypical tribal costume',
  'stock "exotic" imagery unrelated to the described setting',
];

/**
 * Build the location clause for a visual prompt from book-grounded fields
 * only. Returns null when there is nothing concrete to add — callers
 * should fall back to whatever generic location text they already have
 * rather than inventing something here.
 */
export function buildLocationCulturalClause(loc: LocationCulturalInfo | null | undefined): string | null {
  if (!loc) return null;
  const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  const bits: string[] = [];
  if (place) bits.push(`set in ${place}`);
  if (loc.culturalContext) bits.push(loc.culturalContext);
  if (!bits.length) return null;
  return bits.join('; ');
}

/**
 * Negative-prompt terms to append whenever a location has a specific
 * country/region on record. Applied unconditionally as a safety net —
 * cheap to include, and it only ever suppresses generic tropes rather
 * than constraining anything the book actually describes.
 */
export function culturalNegativeConstraints(loc: LocationCulturalInfo | null | undefined): string[] {
  if (!loc) return [];
  if (!loc.country && !loc.region) return [];
  return GENERIC_STEREOTYPE_NEGATIVES;
}
