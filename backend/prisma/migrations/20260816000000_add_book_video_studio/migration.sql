-- AI Book-to-Video / Film Studio: manuscripts, chapters, video projects,
-- film bible, characters, locations, props, scenes.

-- CreateEnum
CREATE TYPE "ManuscriptFileType" AS ENUM ('PDF', 'DOCX', 'TXT');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'EXTRACTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoProjectStatus" AS ENUM ('DRAFT', 'ANALYZING', 'PLANNING', 'GENERATING_REFERENCES', 'GENERATING_SCENES', 'GENERATING_VIDEO', 'ASSEMBLING', 'COMPLETED', 'FAILED', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "VisualStyle" AS ENUM ('CINEMATIC_REALISM', 'ANIMATION', 'ANIME', 'DOCUMENTARY', 'FANTASY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VideoAspectRatio" AS ENUM ('RATIO_16_9', 'RATIO_9_16', 'RATIO_1_1');

-- CreateEnum
CREATE TYPE "TextAIProviderName" AS ENUM ('GROQ', 'LOCAL_FALLBACK');

-- CreateEnum
CREATE TYPE "VideoProviderName" AS ENUM ('GEMINI_VEO');

-- CreateEnum
CREATE TYPE "VideoSceneStatus" AS ENUM ('PENDING', 'PROMPT_READY', 'GENERATING', 'RENDERED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ProviderErrorType" AS ENUM ('TIMEOUT', 'RATE_LIMIT', 'SAFETY_REJECTION', 'INVALID_PROMPT', 'INVALID_FILE', 'STORAGE_ERROR', 'FFMPEG_ERROR', 'DATABASE_ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "manuscripts" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileType" "ManuscriptFileType" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedWordCount" INTEGER,
    "extractedCharacterCount" INTEGER,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manuscripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT,
    "sourceText" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "startPosition" INTEGER NOT NULL,
    "endPosition" INTEGER NOT NULL,
    "extractionMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_projects" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VideoProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "aiProvider" "TextAIProviderName" NOT NULL DEFAULT 'GROQ',
    "aiModel" TEXT,
    "videoProviderName" "VideoProviderName" NOT NULL DEFAULT 'GEMINI_VEO',
    "videoModel" TEXT,
    "visualStyle" "VisualStyle" NOT NULL DEFAULT 'CINEMATIC_REALISM',
    "narrationVoice" TEXT,
    "aspectRatio" "VideoAspectRatio" NOT NULL DEFAULT 'RATIO_16_9',
    "resolution" TEXT,
    "narrationWordsPerMinute" INTEGER NOT NULL DEFAULT 150,
    "totalChapters" INTEGER NOT NULL DEFAULT 0,
    "totalScenes" INTEGER NOT NULL DEFAULT 0,
    "completedScenes" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalVideoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "errorMessage" TEXT,
    "pausedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "film_bibles" (
    "id" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "premise" TEXT,
    "themes" JSONB,
    "genre" TEXT,
    "tone" TEXT,
    "visualStyleNotes" TEXT,
    "cinematography" JSONB,
    "colorLanguage" JSONB,
    "lighting" JSONB,
    "cameraLanguage" JSONB,
    "historicalPeriod" TEXT,
    "geography" JSONB,
    "worldRules" JSONB,
    "narrativeRules" JSONB,
    "characterConsistencyRules" JSONB,
    "locationConsistencyRules" JSONB,
    "timeline" JSONB,
    "rawAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "film_bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_characters" (
    "id" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age" TEXT,
    "gender" TEXT,
    "physicalAppearance" TEXT,
    "clothing" TEXT,
    "personality" TEXT,
    "role" TEXT,
    "characterArc" TEXT,
    "referenceImageUrl" TEXT,
    "negativePrompt" TEXT,
    "continuityNotes" TEXT,
    "isFactUnknown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_locations" (
    "id" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "architecture" TEXT,
    "environment" TEXT,
    "timePeriod" TEXT,
    "weatherPatterns" TEXT,
    "lightingRules" TEXT,
    "visualDescription" TEXT,
    "referenceImageUrl" TEXT,
    "continuityNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_props" (
    "id" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visualDescription" TEXT,
    "referenceImageUrl" TEXT,
    "continuityNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_props_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_scenes" (
    "id" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "narrationText" TEXT NOT NULL,
    "summary" TEXT,
    "characters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "props" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action" TEXT,
    "emotionalBeat" TEXT,
    "cameraPlan" TEXT,
    "visualPrompt" TEXT,
    "negativePrompt" TEXT,
    "estimatedDurationSec" DOUBLE PRECISION,
    "status" "VideoSceneStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "VideoProviderName",
    "providerGenerationId" TEXT,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "subtitleUrl" TEXT,
    "thumbnailUrl" TEXT,
    "lastErrorType" "ProviderErrorType",
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manuscripts_bookId_key" ON "manuscripts"("bookId");

-- CreateIndex
CREATE INDEX "manuscripts_bookId_idx" ON "manuscripts"("bookId");

-- CreateIndex
CREATE INDEX "manuscripts_extractionStatus_idx" ON "manuscripts"("extractionStatus");

-- CreateIndex
CREATE INDEX "chapters_manuscriptId_idx" ON "chapters"("manuscriptId");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_manuscriptId_chapterNumber_key" ON "chapters"("manuscriptId", "chapterNumber");

-- CreateIndex
CREATE INDEX "video_projects_bookId_idx" ON "video_projects"("bookId");

-- CreateIndex
CREATE INDEX "video_projects_manuscriptId_idx" ON "video_projects"("manuscriptId");

-- CreateIndex
CREATE INDEX "video_projects_status_idx" ON "video_projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "film_bibles_videoProjectId_key" ON "film_bibles"("videoProjectId");

-- CreateIndex
CREATE INDEX "video_characters_videoProjectId_idx" ON "video_characters"("videoProjectId");

-- CreateIndex
CREATE INDEX "video_locations_videoProjectId_idx" ON "video_locations"("videoProjectId");

-- CreateIndex
CREATE INDEX "video_props_videoProjectId_idx" ON "video_props"("videoProjectId");

-- CreateIndex
CREATE INDEX "video_scenes_videoProjectId_idx" ON "video_scenes"("videoProjectId");

-- CreateIndex
CREATE INDEX "video_scenes_chapterId_idx" ON "video_scenes"("chapterId");

-- CreateIndex
CREATE INDEX "video_scenes_status_idx" ON "video_scenes"("status");

-- CreateIndex
CREATE INDEX "video_scenes_providerGenerationId_idx" ON "video_scenes"("providerGenerationId");

-- CreateIndex
CREATE UNIQUE INDEX "video_scenes_videoProjectId_chapterId_sceneNumber_key" ON "video_scenes"("videoProjectId", "chapterId", "sceneNumber");

-- AddForeignKey
ALTER TABLE "manuscripts" ADD CONSTRAINT "manuscripts_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "manuscripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "manuscripts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "film_bibles" ADD CONSTRAINT "film_bibles_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_characters" ADD CONSTRAINT "video_characters_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_locations" ADD CONSTRAINT "video_locations_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_props" ADD CONSTRAINT "video_props_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;