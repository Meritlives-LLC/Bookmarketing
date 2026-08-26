-- Additive only. Tracks pre-generation grounding-validation attempts on
-- video_scenes, separate from provider retryCount, so a scene with an
-- invented/unmatched character or location is force-failed after a small
-- cap rather than retried indefinitely against the (paid) video provider.
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "groundingValidationAttempts" INTEGER NOT NULL DEFAULT 0;
