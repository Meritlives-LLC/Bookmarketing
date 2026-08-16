"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import {
  optimizeCoverUrl,
  COVER_CARD_SIZES,
  COVER_DETAIL_SIZES,
  type CoverImageVariant,
} from "@/lib/cover-image";
import { cn } from "@/lib/utils";

type BookCoverImageProps = {
  src?: string | null;
  alt: string;
  variant?: CoverImageVariant;
  /** Eager-load above-the-fold covers (first row). */
  priority?: boolean;
  className?: string;
  /** Wrapper classes for the aspect / size box */
  containerClassName?: string;
};

/**
 * Optimized book cover:
 * - next/image (lazy by default, responsive sizes, modern formats via optimizer)
 * - Cloudinary URL transforms when applicable (smaller bytes before download)
 * - Graceful fallback icon on error / missing src
 */
export function BookCoverImage({
  src,
  alt,
  variant = "card",
  priority = false,
  className,
  containerClassName,
}: BookCoverImageProps) {
  const [failed, setFailed] = useState(false);
  const optimized = optimizeCoverUrl(src, variant);
  const showImage = Boolean(optimized) && !failed;

  const sizes = variant === "detail" ? COVER_DETAIL_SIZES : COVER_CARD_SIZES;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800",
        variant === "card" && "aspect-[2/3] w-full",
        containerClassName
      )}
    >
      {showImage ? (
        <Image
          src={optimized!}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          quality={75}
          className={cn(
            "object-cover object-top",
            className
          )}
          onError={() => setFailed(true)}
          // Avoid referrer leaks to Amazon/GR; Cloudinary is fine either way
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full min-h-[8rem] w-full items-center justify-center">
          <BookOpen
            className={cn(
              "text-brand-400",
              variant === "detail" ? "h-10 w-10" : "h-14 w-14"
            )}
          />
        </div>
      )}
    </div>
  );
}
