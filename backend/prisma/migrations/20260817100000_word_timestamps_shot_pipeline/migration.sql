-- Word timestamps + narration audio URL for audio-aware pipeline
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "narrationAudioUrl" TEXT;

CREATE TABLE IF NOT EXISTS "word_timestamps" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "word_timestamps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "word_timestamps_sceneId_index_key" ON "word_timestamps"("sceneId", "index");
CREATE INDEX IF NOT EXISTS "word_timestamps_sceneId_idx" ON "word_timestamps"("sceneId");

DO $$ BEGIN
  ALTER TABLE "word_timestamps" ADD CONSTRAINT "word_timestamps_sceneId_fkey"
    FOREIGN KEY ("sceneId") REFERENCES "video_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
