import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { storageService } from './storage.service';
import { secureDownloadToFile } from '../utils/secure-remote-fetch';

const execFileAsync = promisify(execFile);

// A single provider-generated shot clip should never legitimately exceed a
// few hundred MB; capping here bounds both memory/disk use per download and
// the damage an SSRF/DoS attempt via a huge response body could do.
const MAX_CLIP_BYTES = 300 * 1024 * 1024;
// Narration clips are a few minutes of speech at most — far smaller than a
// video clip — but still bounded for the same reason.
const MAX_NARRATION_BYTES = 50 * 1024 * 1024;
const MAX_CLIPS_PER_ASSEMBLY = 200;
const MAX_TOTAL_DURATION_SEC = 60 * 60; // 1 hour

export interface AssemblyClip {
  videoUrl: string;
  durationSec: number;
  srtContent?: string;
  /**
   * Storage key (or URL) of narration audio for this clip, e.g. from
   * narrationService.generate(). When present, it is muxed into the clip
   * before concat per `narrationMode`. When absent, the clip's own audio
   * (if any — e.g. Veo 3's native audio) passes through untouched.
   */
  narrationAudioUrl?: string;
}

export interface AssembleOptions {
  projectId: string;
  clips: AssemblyClip[];
  fullSrt?: string;
  fullVtt?: string;
  fullAss?: string;
  burnSubtitles?: boolean;
  subtitleStyle?: string;
  /**
   * 'replace' (default): narration becomes the clip's only audio track —
   * whatever native audio the provider generated (e.g. Veo 3 ambience) is
   * dropped.
   * 'mix': narration is layered over the clip's existing audio, with the
   * original ducked under `duckToDb` so narration stays intelligible.
   * Clips with no narrationAudioUrl are unaffected either way.
   */
  narrationMode?: 'replace' | 'mix';
  /** dB level (negative = quieter) applied to the original audio bed in 'mix' mode. Default -18dB. */
  narrationDuckDb?: number;
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

async function downloadToFile(
  urlOrKey: string,
  dest: string,
  opts: { maxBytes: number; allowedContentTypePrefixes: string[] },
): Promise<void> {
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
  // Clips fed to FFmpeg must never be fetched with an unrestricted
  // fetch() — a provider-influenced or malformed videoUrl could otherwise
  // be used to reach internal/private network addresses (SSRF) before the
  // bytes ever hit FFmpeg. Route through the centralized, SSRF-hardened
  // downloader instead (HTTPS-only, private/reserved IPs blocked, redirects
  // re-validated, size/time capped, streamed rather than buffered).
  await secureDownloadToFile(urlOrKey, dest, opts);
}

async function downloadClipToFile(urlOrKey: string, dest: string): Promise<void> {
  await downloadToFile(urlOrKey, dest, {
    maxBytes: MAX_CLIP_BYTES,
    allowedContentTypePrefixes: ['video/', 'application/octet-stream'],
  });
}

async function downloadNarrationToFile(urlOrKey: string, dest: string): Promise<void> {
  await downloadToFile(urlOrKey, dest, {
    maxBytes: MAX_NARRATION_BYTES,
    allowedContentTypePrefixes: ['audio/', 'application/octet-stream'],
  });
}

/**
 * Whether a media file has at least one audio stream. Needed before
 * attempting 'mix' mode — a clip with no native audio (silent Veo 2 output)
 * has no `0:a` stream for ffmpeg's amix filter to reference, so that case
 * must fall back to narration-only rather than erroring.
 */
async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      filePath,
    ], { timeout: 30_000 });
    return stdout.trim().length > 0;
  } catch (e) {
    logger.warn('ffprobe audio-stream check failed — assuming no audio', { error: (e as Error).message });
    return false;
  }
}

/**
 * Muxes narration audio into a single clip ahead of concat.
 *
 * 'replace': narration becomes the sole audio track.
 * 'mix': original audio (if present) is ducked under `duckToDb` and layered
 *   with narration; falls back to 'replace' behavior when the clip has no
 *   audio stream to mix against.
 *
 * Narration is padded with silence (`apad`) so it never runs shorter than
 * the clip, then `-shortest` bounds the output to the clip's own video
 * duration — narration that runs longer than the clip is simply cut off at
 * the clip boundary rather than dragging the clip out or overlapping into
 * the next one.
 */
async function muxNarrationIntoClip(
  clipPath: string,
  narrationPath: string,
  outPath: string,
  mode: 'replace' | 'mix',
  duckToDb: number,
): Promise<void> {
  const clipHasAudio = mode === 'mix' && (await hasAudioStream(clipPath));

  const filterComplex = clipHasAudio
    ? `[0:a]volume=${duckToDb}dB[bg];[1:a]apad[fg];[bg][fg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
    : `[1:a]apad[aout]`;

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', clipPath,
    '-i', narrationPath,
    '-filter_complex', filterComplex,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    outPath,
  ], { timeout: 300_000 });
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
    if (opts.clips.length > MAX_CLIPS_PER_ASSEMBLY) {
      throw AppError.badRequest(`Too many clips in one assembly (max ${MAX_CLIPS_PER_ASSEMBLY})`, 'ASSEMBLY_TOO_LARGE');
    }
    const requestedDuration = opts.clips.reduce((sum, c) => sum + (c.durationSec || 0), 0);
    if (requestedDuration > MAX_TOTAL_DURATION_SEC) {
      throw AppError.badRequest(`Total duration exceeds maximum allowed (${MAX_TOTAL_DURATION_SEC}s)`, 'ASSEMBLY_TOO_LARGE');
    }
    // opts.projectId doubles as a storage key prefix (book-video/<projectId>/final),
    // where slashes are wanted (e.g. "<id>/scenes/<sceneId>" for scene-level
    // assembly) — but fs.mkdtemp requires its prefix's parent directory to
    // already exist, so a projectId containing "/" made mkdtemp throw ENOENT
    // on every call before any work was done. Flatten only for the local temp
    // dir name; the storage keys below still use the original opts.projectId.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `bmos-film-${sanitizeTmpDirPrefix(opts.projectId)}-`));
    const clipPaths: string[] = [];
    let totalDuration = 0;
    const narrationMode = opts.narrationMode ?? 'replace';
    const narrationDuckDb = opts.narrationDuckDb ?? -18;
    try {
      for (let i = 0; i < opts.clips.length; i++) {
        const idx = String(i).padStart(4, '0');
        const local = path.join(tmp, `clip_${idx}.mp4`);
        await downloadClipToFile(opts.clips[i].videoUrl, local);
        totalDuration += opts.clips[i].durationSec || 0;

        const narrationUrl = opts.clips[i].narrationAudioUrl;
        if (narrationUrl) {
          const narrationPath = path.join(tmp, `narration_${idx}.mp3`);
          const muxedPath = path.join(tmp, `clip_${idx}_muxed.mp4`);
          try {
            await downloadNarrationToFile(narrationUrl, narrationPath);
            await muxNarrationIntoClip(local, narrationPath, muxedPath, narrationMode, narrationDuckDb);
            clipPaths.push(muxedPath);
            continue;
          } catch (e) {
            // Narration is an enhancement, not a hard requirement for the
            // film to exist — a single clip's narration failing should not
            // fail the whole assembly. Fall back to the clip's own audio
            // (silence, for Veo 2; native audio, for Veo 3) for this clip.
            logger.error('Narration mux failed for clip — using clip audio as-is', {
              clipIndex: i, error: (e as Error).message,
            });
          }
        }
        clipPaths.push(local);
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
