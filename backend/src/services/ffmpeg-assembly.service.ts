import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { storageService } from './storage.service';

const execFileAsync = promisify(execFile);

export interface AssemblyClip {
  videoUrl: string;
  durationSec: number;
  srtContent?: string;
}

export interface AssembleOptions {
  projectId: string;
  clips: AssemblyClip[];
  fullSrt?: string;
  fullVtt?: string;
  fullAss?: string;
  burnSubtitles?: boolean;
  subtitleStyle?: string;
}

export interface AssembleResult {
  cleanVideoKey: string;
  subtitleVideoKey?: string;
  srtKey?: string;
  vttKey?: string;
  assKey?: string;
  thumbnailKey?: string;
  totalDurationSec: number;
}

function assStyleBlock(style: string): string {
  const styles: Record<string, string> = {
    CLASSIC: 'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2.5,1.5,2,40,40,40,1',
    MODERN: 'Style: Default,Helvetica,46,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,50,1',
    CINEMATIC: 'Style: Default,Georgia,50,&H00F0F0F0,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,60,60,55,1',
    MINIMAL: 'Style: Default,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,2,20,20,30,1',
    BOLD: 'Style: Default,Arial Black,52,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,1,0,0,0,100,100,0,0,1,3,0,2,40,40,45,1',
    CUSTOM: 'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2.5,1.5,2,40,40,40,1',
  };
  return styles[style] || styles.CINEMATIC;
}

export function srtToAss(srt: string, styleName: string): string {
  const style = assStyleBlock(styleName);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  function srtTsToAss(ts: string): string {
    const m = ts.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return '0:00:00.00';
    const h = parseInt(m[1], 10);
    const cs = Math.round(parseInt(m[4].padEnd(3, '0').slice(0, 3), 10) / 10);
    return `${h}:${m[2]}:${m[3]}.${String(cs).padStart(2, '0')}`;
  }
  const blocks = srt.replace(/\r\n/g, '\n').split(/\n\n+/);
  const events: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;
    const [startRaw, endRaw] = timing.split('-->').map((s) => s.trim());
    const textLines = lines.slice(lines.indexOf(timing) + 1);
    const text = textLines.join('\\N').replace(/[{}]/g, '');
    events.push(`Dialogue: 0,${srtTsToAss(startRaw)},${srtTsToAss(endRaw)},Default,,0,0,0,,${text}`);
  }
  return header + events.join('\n') + '\n';
}

async function ensureFfmpeg(): Promise<void> {
  try { await execFileAsync('ffmpeg', ['-version']); }
  catch {
    throw AppError.internal('FFmpeg is not installed on this host.', 'FFMPEG_MISSING');
  }
}

async function downloadToFile(urlOrKey: string, dest: string): Promise<void> {
  if (!/^https?:\/\//i.test(urlOrKey)) {
    try {
      const buf = await storageService.getObjectBuffer(urlOrKey);
      await fs.writeFile(dest, buf);
      return;
    } catch (e) {
      const publicUrl = storageService.publicUrl(urlOrKey);
      if (publicUrl) urlOrKey = publicUrl;
      else throw e;
    }
  }
  const res = await fetch(urlOrKey);
  if (!res.ok) throw new Error(`Failed to download clip: ${res.status}`);
  const body = res.body;
  if (!body) throw new Error('Empty response body');
  await pipeline(Readable.fromWeb(body as any), createWriteStream(dest));
}

/**
 * Flattens a project/scene identifier into a value safe to use as an
 * fs.mkdtemp prefix. Extracted as its own function (rather than left inline)
 * so the regression this exists to prevent — a projectId containing "/"
 * (e.g. "<id>/scenes/<sceneId>" for scene-level assembly) making mkdtemp
 * throw ENOENT because its prefix's parent directory doesn't exist — has a
 * direct, dependency-free unit test instead of only being covered
 * indirectly by a full (FFmpeg + S3 dependent) assemble() call.
 */
export function sanitizeTmpDirPrefix(projectId: string): string {
  return projectId.replace(/[\\/]/g, '-');
}

export const ffmpegAssemblyService = {
  srtToAss,
  sanitizeTmpDirPrefix,
  async isAvailable(): Promise<boolean> {
    try { await execFileAsync('ffmpeg', ['-version']); return true; }
    catch { return false; }
  },
  async assemble(opts: AssembleOptions): Promise<AssembleResult> {
    await ensureFfmpeg();
    if (!opts.clips.length) throw AppError.badRequest('No clips to assemble');
    // opts.projectId doubles as a storage key prefix (book-video/<projectId>/final),
    // where slashes are wanted (e.g. "<id>/scenes/<sceneId>" for scene-level
    // assembly) — but fs.mkdtemp requires its prefix's parent directory to
    // already exist, so a projectId containing "/" made mkdtemp throw ENOENT
    // on every call before any work was done. Flatten only for the local temp
    // dir name; the storage keys below still use the original opts.projectId.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `bmos-film-${sanitizeTmpDirPrefix(opts.projectId)}-`));
    const clipPaths: string[] = [];
    let totalDuration = 0;
    try {
      for (let i = 0; i < opts.clips.length; i++) {
        const local = path.join(tmp, `clip_${String(i).padStart(4, '0')}.mp4`);
        await downloadToFile(opts.clips[i].videoUrl, local);
        clipPaths.push(local);
        totalDuration += opts.clips[i].durationSec || 0;
      }
      const listFile = path.join(tmp, 'concat.txt');
      await fs.writeFile(listFile, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf-8');
      const cleanPath = path.join(tmp, 'clean.mp4');
      try {
        await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', cleanPath], { timeout: 600_000 });
        const st = await fs.stat(cleanPath);
        if (st.size < 1000) throw new Error('empty');
      } catch {
        logger.warn('Concat copy failed — re-encoding');
        await execFileAsync('ffmpeg', [
          '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', cleanPath,
        ], { timeout: 1_200_000 });
      }
      const thumbPath = path.join(tmp, 'thumb.jpg');
      try {
        await execFileAsync('ffmpeg', ['-y', '-ss', '2', '-i', cleanPath, '-frames:v', '1', '-q:v', '3', thumbPath], { timeout: 60_000 });
      } catch { logger.warn('Thumbnail generation failed'); }

      const cleanBuf = await fs.readFile(cleanPath);
      const cleanKey = await storageService.uploadBuffer(cleanBuf, 'video/mp4', `book-video/${opts.projectId}/final`);

      let subtitleVideoKey: string | undefined;
      let assKey: string | undefined;
      if (opts.burnSubtitles && (opts.fullAss || opts.fullSrt)) {
        const assContent = opts.fullAss || srtToAss(opts.fullSrt!, opts.subtitleStyle || 'CINEMATIC');
        const assPath = path.join(tmp, 'subs.ass');
        await fs.writeFile(assPath, assContent, 'utf-8');
        const burnedPath = path.join(tmp, 'burned.mp4');
        const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
        try {
          await execFileAsync('ffmpeg', [
            '-y', '-i', cleanPath, '-vf', `ass=${assEscaped}`,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy',
            '-movflags', '+faststart', burnedPath,
          ], { timeout: 1_200_000 });
          subtitleVideoKey = await storageService.uploadBuffer(await fs.readFile(burnedPath), 'video/mp4', `book-video/${opts.projectId}/final`);
        } catch (e) {
          logger.error('Burned subtitle encode failed', { error: (e as Error).message });
          if (opts.fullSrt) {
            const srtPath = path.join(tmp, 'subs.srt');
            await fs.writeFile(srtPath, opts.fullSrt, 'utf-8');
            const srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            try {
              await execFileAsync('ffmpeg', [
                '-y', '-i', cleanPath, '-vf', `subtitles=${srtEsc}`,
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy',
                '-movflags', '+faststart', burnedPath,
              ], { timeout: 1_200_000 });
              subtitleVideoKey = await storageService.uploadBuffer(await fs.readFile(burnedPath), 'video/mp4', `book-video/${opts.projectId}/final`);
            } catch (e2) {
              logger.error('SRT burn-in also failed', { error: (e2 as Error).message });
            }
          }
        }
        assKey = await storageService.uploadBuffer(Buffer.from(assContent, 'utf-8'), 'text/plain', `book-video/${opts.projectId}/final`);
      }

      let srtKey: string | undefined;
      let vttKey: string | undefined;
      if (opts.fullSrt) srtKey = await storageService.uploadBuffer(Buffer.from(opts.fullSrt, 'utf-8'), 'application/x-subrip', `book-video/${opts.projectId}/final`);
      if (opts.fullVtt) vttKey = await storageService.uploadBuffer(Buffer.from(opts.fullVtt, 'utf-8'), 'text/vtt', `book-video/${opts.projectId}/final`);

      let thumbnailKey: string | undefined;
      try {
        thumbnailKey = await storageService.uploadBuffer(await fs.readFile(thumbPath), 'image/jpeg', `book-video/${opts.projectId}/final`);
      } catch { /* no thumb */ }

      logger.info('FFmpeg assembly complete', { projectId: opts.projectId, clips: opts.clips.length, cleanKey, subtitleVideoKey });
      return { cleanVideoKey: cleanKey, subtitleVideoKey, srtKey, vttKey, assKey, thumbnailKey, totalDurationSec: totalDuration };
    } finally {
      try { await fs.rm(tmp, { recursive: true, force: true }); } catch { logger.warn('Failed to clean temp dir', { tmp }); }
    }
  },
};
