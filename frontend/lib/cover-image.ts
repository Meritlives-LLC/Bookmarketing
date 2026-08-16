/**
 * Client-side helpers for book cover URLs.
 * - Injects Cloudinary delivery transforms when the URL is already on Cloudinary
 *   so the browser downloads a small WebP/AVIF instead of a large master.
 * - Leaves non-Cloudinary URLs unchanged (next/image still resizes via the optimizer).
 */

export type CoverImageVariant = "card" | "detail" | "thumb";

const CLOUDINARY_HOST = /res\.cloudinary\.com/i;

/** Transforms applied in the URL path after /upload/ */
const VARIANT_TRANSFORMS: Record<CoverImageVariant, string> = {
  // Matches BookCard 2:3, ~2× DPR on a 5-col grid (~180–220px CSS width)
  card: "c_fill,g_north,w_400,h_600,f_auto,q_auto:good,dpr_auto",
  // Detail sidebar
  detail: "c_fill,g_north,w_320,h_480,f_auto,q_auto:good,dpr_auto",
  // Tiny lists / previews
  thumb: "c_fill,g_north,w_160,h_240,f_auto,q_auto:eco,dpr_auto",
};

/**
 * If `url` is a Cloudinary delivery URL, insert (or replace) transform segment
 * for the given variant. Otherwise return the original URL.
 */
export function optimizeCoverUrl(
  url: string | null | undefined,
  variant: CoverImageVariant = "card"
): string | null {
  if (!url?.trim()) return null;
  const src = url.trim();
  if (!CLOUDINARY_HOST.test(src)) return src;

  const transform = VARIANT_TRANSFORMS[variant];
  // Match .../upload/ optionally followed by existing transforms or version
  // Examples:
  //   /upload/v1234/folder/id
  //   /upload/w_100,c_fill/v1234/folder/id
  //   /upload/folder/id.jpg
  const uploadIdx = src.indexOf("/upload/");
  if (uploadIdx === -1) return src;

  const prefix = src.slice(0, uploadIdx + "/upload/".length);
  let rest = src.slice(uploadIdx + "/upload/".length);

  // Strip a leading transform chain (comma-separated tokens before next /)
  // Keep version segment v1234 if present after transforms
  const versionMatch = rest.match(/^(?:[^/]+\/)?(v\d+\/)/);
  // Simpler: if first segment has a comma or known transform keys, drop it
  const firstSlash = rest.indexOf("/");
  if (firstSlash > 0) {
    const first = rest.slice(0, firstSlash);
    const looksLikeTransform =
      first.includes(",") ||
      /^(c_|w_|h_|f_|q_|g_|dpr_|e_|b_|ar_)/.test(first);
    if (looksLikeTransform) {
      rest = rest.slice(firstSlash + 1);
    }
  }

  return `${prefix}${transform}/${rest}`;
}

/** Responsive sizes hint for the books grid (2–5 columns). */
export const COVER_CARD_SIZES =
  "(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw";

export const COVER_DETAIL_SIZES = "128px";
