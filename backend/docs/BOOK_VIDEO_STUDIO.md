# AI Book-to-Cinematic-Film Studio

## Setup
```bash
cd backend
npx prisma migrate deploy && npx prisma generate
# set GEMINI_API_KEY, VIDEO_MODEL in .env
npm run worker:book-video
```

## FFmpeg
Install ffmpeg on the worker host for full film concat + burned-in ASS subtitles.

## Pipeline
Manuscript → chapters → hierarchical AI analysis → Film Bible → references →
scenes/shots → video provider → word-for-word subtitles → FFmpeg assembly.
