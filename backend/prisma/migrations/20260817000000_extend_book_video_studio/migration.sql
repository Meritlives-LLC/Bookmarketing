CREATE TYPE "SubtitleMode" AS ENUM ('OFF', 'SOFT', 'BURNED_IN');
CREATE TYPE "SubtitleStyle" AS ENUM ('CLASSIC', 'MODERN', 'CINEMATIC', 'MINIMAL', 'BOLD', 'CUSTOM');
CREATE TYPE "VideoShotStatus" AS ENUM ('PENDING', 'PROMPT_READY', 'GENERATING', 'RENDERED', 'FAILED');
ALTER TYPE "VideoProjectStatus" ADD VALUE IF NOT EXISTS 'GENERATING_SUBTITLES';
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "subtitleEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "subtitleMode" "SubtitleMode" NOT NULL DEFAULT 'SOFT';
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "subtitleStyle" "SubtitleStyle" NOT NULL DEFAULT 'CINEMATIC';
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "subtitleConfig" JSONB;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "cleanVideoUrl" TEXT;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "subtitleVideoUrl" TEXT;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "srtUrl" TEXT;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "vttUrl" TEXT;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "assUrl" TEXT;
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "actualDurationSec" DOUBLE PRECISION;
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "narrationDurationSec" DOUBLE PRECISION;
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "sourceStart" INTEGER;
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "sourceEnd" INTEGER;
CREATE TABLE IF NOT EXISTS "video_shots" (
    "id" TEXT NOT NULL, "sceneId" TEXT NOT NULL, "shotNumber" INTEGER NOT NULL,
    "shotType" TEXT, "sourceTextSegment" TEXT, "action" TEXT, "camera" TEXT, "lens" TEXT,
    "movement" TEXT, "composition" TEXT, "lighting" TEXT, "durationSec" DOUBLE PRECISION,
    "startOffsetSec" DOUBLE PRECISION, "visualPrompt" TEXT, "negativePrompt" TEXT,
    "status" "VideoShotStatus" NOT NULL DEFAULT 'PENDING', "videoUrl" TEXT,
    "providerGenerationId" TEXT, "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_shots_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "subtitle_cues" (
    "id" TEXT NOT NULL, "sceneId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "text" TEXT NOT NULL,
    "startTimeMs" INTEGER NOT NULL, "endTimeMs" INTEGER NOT NULL,
    "startWordIndex" INTEGER, "endWordIndex" INTEGER, "speakerLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subtitle_cues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_shots_sceneId_shotNumber_key" ON "video_shots"("sceneId", "shotNumber");
CREATE INDEX IF NOT EXISTS "video_shots_sceneId_idx" ON "video_shots"("sceneId");
CREATE UNIQUE INDEX IF NOT EXISTS "subtitle_cues_sceneId_sequence_key" ON "subtitle_cues"("sceneId", "sequence");
CREATE INDEX IF NOT EXISTS "subtitle_cues_sceneId_idx" ON "subtitle_cues"("sceneId");
DO $$ BEGIN
  ALTER TABLE "video_shots" ADD CONSTRAINT "video_shots_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "video_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "subtitle_cues" ADD CONSTRAINT "subtitle_cues_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "video_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
