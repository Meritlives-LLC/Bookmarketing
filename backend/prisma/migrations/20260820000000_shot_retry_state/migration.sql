-- Shot-level retry/idempotency state, bringing VideoShot to parity with the
-- retry tracking VideoScene already has. Additive only; no data loss.
ALTER TABLE "video_shots" ADD COLUMN IF NOT EXISTS "generationStartedAt" TIMESTAMP(3);
ALTER TABLE "video_shots" ADD COLUMN IF NOT EXISTS "lastErrorType" "ProviderErrorType";
ALTER TABLE "video_shots" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "video_shots_status_idx" ON "video_shots"("status");
CREATE INDEX IF NOT EXISTS "video_shots_providerGenerationId_idx" ON "video_shots"("providerGenerationId");