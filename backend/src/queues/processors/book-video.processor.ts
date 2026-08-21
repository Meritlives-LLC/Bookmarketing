import { Job } from 'bullmq';
import { logger } from '../../utils/logger';
import { bookVideoAnalysisService } from '../../services/book-video-analysis.service';
import { scenePlannerService } from '../../services/scene-planner.service';
import { videoProjectService } from '../../services/video-project.service';
import { subtitleService } from '../../services/subtitle.service';
import { referenceImageService } from '../../services/reference-image.service';
import { ffmpegAssemblyService } from '../../services/ffmpeg-assembly.service';
import { videoProjectRepository } from '../../repositories/video-project.repository';
import { prisma } from '../../config/database';
import { storageService } from '../../services/storage.service';
import { enqueueGenerateReferences, enqueueAssembleFilm } from '../book-video.queue';

export async function processBookVideoJob(job: Job): Promise<void> {
  logger.info('Processing book-video job', { jobId: job.id, name: job.name });
  switch (job.name) {
    case 'analyze-project': {
      const { videoProjectId } = job.data as { videoProjectId: string };
      try {
        await bookVideoAnalysisService.analyzeProject(videoProjectId);
        await scenePlannerService.planProject(videoProjectId);
        await enqueueGenerateReferences({ videoProjectId });
      } catch (error) {
        await videoProjectRepository.updateStatus(videoProjectId, 'FAILED', { errorMessage: (error as Error).message });
        throw error;
      }
      break;
    }
    case 'plan-scenes': {
      const { videoProjectId, chapterId } = job.data as { videoProjectId: string; chapterId?: string };
      try {
        await scenePlannerService.planProject(videoProjectId, chapterId);
        await enqueueGenerateReferences({ videoProjectId });
      } catch (error) {
        await videoProjectRepository.updateStatus(videoProjectId, 'FAILED', { errorMessage: (error as Error).message });
        throw error;
      }
      break;
    }
    case 'generate-references': {
      const { videoProjectId, force } = job.data as { videoProjectId: string; force?: boolean };
      try {
        await videoProjectRepository.updateStatus(videoProjectId, 'GENERATING_REFERENCES', { progress: 68 });
        await referenceImageService.generateForProject(videoProjectId, { force });
        await videoProjectRepository.updateStatus(videoProjectId, 'GENERATING_SCENES', { progress: 71 });
      } catch (error) {
        logger.error('Reference generation failed (non-fatal)', { error: (error as Error).message });
        await videoProjectRepository.updateStatus(videoProjectId, 'GENERATING_SCENES', { progress: 71 });
      }
      break;
    }
    case 'generate-scene-video': {
      await videoProjectService.processSceneVideo((job.data as { sceneId: string }).sceneId);
      break;
    }
    case 'generate-subtitles': {
      const { videoProjectId, sceneId } = job.data as { videoProjectId: string; sceneId?: string };
      const scenes = sceneId
        ? await prisma.videoScene.findMany({ where: { id: sceneId } })
        : await prisma.videoScene.findMany({ where: { videoProjectId, status: 'RENDERED' }, orderBy: [{ chapter: { chapterNumber: 'asc' } }, { sceneNumber: 'asc' }] });
      for (const scene of scenes) {
        try {
          const { srt } = await subtitleService.generateForScene(scene.id);
          const srtKey = await storageService.uploadBuffer(Buffer.from(srt, 'utf-8'), 'application/x-subrip', `book-video/${videoProjectId}/subtitles/scenes/${scene.id}`);
          await prisma.videoScene.update({ where: { id: scene.id }, data: { subtitleUrl: srtKey } });
        } catch (error) {
          logger.error('Subtitle gen failed', { sceneId: scene.id, error: (error as Error).message });
        }
      }
      await videoProjectRepository.updateStatus(videoProjectId, 'ASSEMBLING', { progress: 92 });
      await enqueueAssembleFilm({ videoProjectId });
      break;
    }
    case 'assemble-film': {
      const { videoProjectId } = job.data as { videoProjectId: string };
      const project = await videoProjectRepository.findById(videoProjectId);
      if (!project) return;
      const scenes = await prisma.videoScene.findMany({ where: { videoProjectId }, orderBy: [{ chapter: { chapterNumber: 'asc' } }, { sceneNumber: 'asc' }] });
      const rendered = scenes.filter((s) => s.status === 'RENDERED' && s.videoUrl);
      const failed = scenes.filter((s) => s.status === 'FAILED');
      if (!rendered.length) {
        await videoProjectRepository.updateStatus(videoProjectId, 'FAILED', { errorMessage: 'No rendered scenes available to assemble' });
        return;
      }
      for (const s of rendered) {
        const cueCount = await prisma.subtitleCue.count({ where: { sceneId: s.id } });
        if (cueCount === 0 && project.subtitleEnabled) {
          try { await subtitleService.generateForScene(s.id); } catch { /* non-fatal */ }
        }
      }
      let offsetMs = 0;
      const sceneIds: string[] = [], offsets: number[] = [];
      for (const s of rendered) {
        sceneIds.push(s.id); offsets.push(offsetMs);
        offsetMs += Math.round((s.actualDurationSec ?? s.estimatedDurationSec ?? 6) * 1000);
      }
      const { srt, vtt } = await subtitleService.assembleChapterSubtitles(sceneIds, offsets);
      const ass = ffmpegAssemblyService.srtToAss(srt, project.subtitleStyle || 'CINEMATIC');
      const ffmpegOk = await ffmpegAssemblyService.isAvailable();
      const requiresBurnedIn = project.subtitleEnabled && project.subtitleMode === 'BURNED_IN';
      // A project MUST NOT become COMPLETED if any required scene failed —
      // FFmpeg happily assembles the scenes that DID render, but that is
      // not the same as the film being done. All scenes must have
      // succeeded (no FAILED scenes at all) before this can be COMPLETED.
      const allScenesSucceeded = failed.length === 0 && rendered.length === scenes.length;
      if (ffmpegOk) {
        try {
          const result = await ffmpegAssemblyService.assemble({
            projectId: videoProjectId,
            clips: rendered.map((s) => ({ videoUrl: s.videoUrl!, durationSec: s.actualDurationSec ?? s.estimatedDurationSec ?? 6 })),
            fullSrt: srt, fullVtt: vtt, fullAss: ass,
            burnSubtitles: requiresBurnedIn,
            subtitleStyle: project.subtitleStyle || 'CINEMATIC',
          });
          // Burned-in subtitles were explicitly requested but the encode
          // step never produced a subtitleVideoKey — do not claim the
          // burned-in output succeeded, and do not mark the project
          // COMPLETED, since the requested required output does not exist.
          const burnedInSatisfied = !requiresBurnedIn || Boolean(result.subtitleVideoKey);
          const canComplete = allScenesSucceeded && burnedInSatisfied;
          await videoProjectRepository.update(videoProjectId, {
            finalVideoUrl: result.cleanVideoKey, cleanVideoUrl: result.cleanVideoKey,
            subtitleVideoUrl: result.subtitleVideoKey ?? null,
            srtUrl: result.srtKey ?? null, vttUrl: result.vttKey ?? null, assUrl: result.assKey ?? null,
            thumbnailUrl: result.thumbnailKey ?? null,
            progress: canComplete ? 100 : 95,
            status: canComplete ? 'COMPLETED' : 'FAILED',
            errorMessage: canComplete
              ? null
              : !burnedInSatisfied
                ? `Burned-in subtitles were requested but could not be produced. Clean video and soft subtitles are available; retry to attempt burn-in again.`
                : `${failed.length} scene(s) failed; assembled ${rendered.length} of ${scenes.length}. Retry failed scenes then re-render.`,
          });
          logger.info('Full FFmpeg assembly complete', { videoProjectId, clips: rendered.length, completed: canComplete });
          break;
        } catch (error) {
          logger.error('FFmpeg assembly failed — soft fallback', { error: (error as Error).message });
        }
      }
      const srtKey = await storageService.uploadBuffer(Buffer.from(srt, 'utf-8'), 'application/x-subrip', `book-video/${videoProjectId}/final`);
      const vttKey = await storageService.uploadBuffer(Buffer.from(vtt, 'utf-8'), 'text/vtt', `book-video/${videoProjectId}/final`);
      const assKey = await storageService.uploadBuffer(Buffer.from(ass, 'utf-8'), 'text/plain', `book-video/${videoProjectId}/final`);
      // This point is only reached when real FFmpeg assembly did NOT
      // happen — either ffmpeg isn't installed, or the assemble() call in
      // the try block above threw. In both cases nothing has actually
      // concatenated the scenes into one film. The ONLY situation where a
      // single scene's raw clip can legitimately stand in for "the film" is
      // when there was exactly one scene to begin with — concatenating one
      // clip with itself is a no-op, so the raw clip genuinely *is* the
      // complete film. For any project with more than one scene, presenting
      // scene 1 alone as the finished film — while marking the project
      // COMPLETED — would silently hide a real assembly failure from the
      // user, so that case must always resolve to FAILED with an honest
      // error, never COMPLETED.
      const totalNonFailedScenes = scenes.filter((s) => s.status !== 'FAILED').length;
      // A single-scene project may only be treated as "complete without
      // real FFmpeg concatenation" when that one scene is the ENTIRE
      // project (no other scenes at all, failed or otherwise) — otherwise
      // this would silently drop every other scene from the final film
      // while still reporting completion. Burned-in subtitles cannot be
      // honored on this raw-clip fallback path (no encode occurred), so a
      // required BURNED_IN mode never allows the fallback to COMPLETE.
      const singleSceneFilm =
        rendered.length === 1 && totalNonFailedScenes === 1 && scenes.length === 1 && !requiresBurnedIn;
      const assemblyWasAttemptedButFailed = ffmpegOk && !singleSceneFilm;
      await videoProjectRepository.update(videoProjectId, {
        finalVideoUrl: singleSceneFilm ? rendered[0].videoUrl : null,
        cleanVideoUrl: singleSceneFilm ? rendered[0].videoUrl : null,
        srtUrl: srtKey, vttUrl: vttKey, assUrl: assKey,
        progress: singleSceneFilm ? 100 : 95,
        status: singleSceneFilm ? 'COMPLETED' : 'FAILED',
        errorMessage: singleSceneFilm
          ? null
          : !ffmpegOk
            ? 'FFmpeg unavailable — cannot assemble multi-scene film. Soft subtitle files saved. Install ffmpeg and retry render.'
            : assemblyWasAttemptedButFailed
              ? `FFmpeg assembly failed while combining ${rendered.length} scene(s) into the final film. Soft subtitle files saved. Retry assembly.`
              : failed.length
                ? `${failed.length} scene(s) failed; ${rendered.length} rendered. Retry failed scenes then re-render.`
                : 'Assembly incomplete',
      });
      break;
    }
    default:
      logger.warn('Unknown book-video job', { name: job.name });
  }
}
