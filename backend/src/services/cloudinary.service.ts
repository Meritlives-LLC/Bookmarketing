/**
 * Cloudinary image hosting for book covers.
 *
 * Strategy:
 * - Upload a lightly constrained master (max ~1000×1500, high quality) so we
 *   keep detail for detail pages / retina without storing multi‑MB originals.
 * - Return a *delivery* URL with on-the-fly transforms (f_auto, q_auto, size)
 *   sized for the BookCard (2:3, ~2× DPR). Masters stay transformable later.
 *
 * Deterministic public_id (hash of source URL) → same listing overwrites, no dupes.
 * When CLOUDINARY_* is unset, uploadRemote returns null (caller keeps source URL).
 */
import { createHash } from "crypto";
import { v2 as cloudinary, type TransformationOptions } from "cloudinary";
import { config } from "../config";
import { logger } from "../utils/logger";

let configured = false;

/** Upload master: enough pixels for 2× detail view, never enlarge. */
const MASTER_UPLOAD_TRANSFORM: TransformationOptions = {
  width: 1000,
  height: 1500,
  crop: "limit",
  quality: "auto:best",
  fetch_format: "auto",
  flags: "progressive",
};

/**
 * Card delivery (~192px tall @1× → ~400×600 @2×).
 * fill + north matches CSS object-cover object-top on the 2:3 card.
 */
const CARD_DELIVERY_TRANSFORM: TransformationOptions[] = [
  {
    width: 400,
    height: 600,
    crop: "fill",
    gravity: "north",
  },
  {
    quality: "auto:good",
    fetch_format: "auto",
    dpr: "auto",
    flags: "progressive",
  },
];

/** Detail sidebar (~144px tall). */
const DETAIL_DELIVERY_TRANSFORM: TransformationOptions[] = [
  {
    width: 320,
    height: 480,
    crop: "fill",
    gravity: "north",
  },
  {
    quality: "auto:good",
    fetch_format: "auto",
    dpr: "auto",
    flags: "progressive",
  },
];

export type CoverVariant = "card" | "detail" | "master";

function ensureConfigured(): boolean {
  if (!config.cloudinary.enabled) return false;
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return true;
}

function publicIdFromSource(sourceUrl: string): string {
  const hash = createHash("sha256").update(sourceUrl.trim()).digest("hex").slice(0, 32);
  return `${config.cloudinary.folder}/${hash}`;
}

function transformsFor(variant: CoverVariant): TransformationOptions | TransformationOptions[] | undefined {
  switch (variant) {
    case "card":
      return CARD_DELIVERY_TRANSFORM;
    case "detail":
      return DETAIL_DELIVERY_TRANSFORM;
    case "master":
      return undefined;
    default:
      return CARD_DELIVERY_TRANSFORM;
  }
}

function buildDeliveryUrl(publicId: string, variant: CoverVariant = "card"): string {
  const transformation = transformsFor(variant);
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: "image",
    type: "upload",
    sign_url: false,
    ...(transformation ? { transformation } : {}),
  });
}

export const cloudinaryService = {
  isEnabled(): boolean {
    return config.cloudinary.enabled;
  },

  /**
   * Fetch `sourceUrl`, store a compact master on Cloudinary, return a card-sized
   * delivery URL (WebP/AVIF when supported, q_auto, 2:3 fill).
   */
  async uploadRemote(sourceUrl: string, variant: CoverVariant = "card"): Promise<string | null> {
    if (!sourceUrl?.trim() || !ensureConfigured()) return null;

    const url = sourceUrl.trim();

    if (
      config.cloudinary.cloudName &&
      url.includes(`res.cloudinary.com/${config.cloudinary.cloudName}/`)
    ) {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
      if (match?.[1]) {
        const pid = match[1].replace(/\.[a-z0-9]+$/i, "");
        return buildDeliveryUrl(pid, variant);
      }
      return url;
    }

    try {
      const publicId = publicIdFromSource(url);

      const result = await cloudinary.uploader.upload(url, {
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        type: "upload",
        eager: CARD_DELIVERY_TRANSFORM,
        eager_async: false,
        transformation: MASTER_UPLOAD_TRANSFORM,
      });

      const pid = result.public_id || publicId;
      if (!pid) {
        const fallback = result.secure_url || result.url;
        return fallback ? fallback.replace(/^http:\/\//i, "https://") : null;
      }

      return buildDeliveryUrl(pid, variant);
    } catch (error) {
      logger.warn("Cloudinary upload failed", {
        error: (error as Error).message,
        sourceUrl: url.slice(0, 120),
      });
      return null;
    }
  },

  urlForPublicId(publicId: string, variant: CoverVariant = "card"): string | null {
    if (!ensureConfigured() || !publicId?.trim()) return null;
    return buildDeliveryUrl(publicId.trim(), variant);
  },
};