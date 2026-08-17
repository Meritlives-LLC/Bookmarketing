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
        : await prisma.videoScene.findMany({ where: { videoProjectId, status: 'RENDERED' }, orderBy: [{ chapterId: 'asc' }, { sceneNumber: 'asc' }] });
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
      const scenes = await prisma.videoScene.findMany({ where: { videoProjectId }, orderBy: [{ chapterId: 'asc' }, { sceneNumber: 'asc' }] });
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
      if (ffmpegOk) {
        try {
          const result = await ffmpegAssemblyService.assemble({
            projectId: videoProjectId,
            clips: rendered.map((s) => ({ videoUrl: s.videoUrl!, durationSec: s.actualDurationSec ?? s.estimatedDurationSec ?? 6 })),
            fullSrt: srt, fullVtt: vtt, fullAss: ass,
            burnSubtitles: project.subtitleEnabled && project.subtitleMode === 'BURNED_IN',
            subtitleStyle: project.subtitleStyle || 'CINEMATIC',
          });
          await videoProjectRepository.update(videoProjectId, {
            finalVideoUrl: result.cleanVideoKey, cleanVideoUrl: result.cleanVideoKey,
            subtitleVideoUrl: result.subtitleVideoKey ?? null,
            srtUrl: result.srtKey ?? null, vttUrl: result.vttKey ?? null, assUrl: result.assKey ?? null,
            thumbnailUrl: result.thumbnailKey ?? null, progress: 100, status: 'COMPLETED',
            errorMessage: failed.length ? `${failed.length} scene(s) failed; assembled ${rendered.length}` : null,
          });
          logger.info('Full FFmpeg assembly complete', { videoProjectId, clips: rendered.length });
          break;
        } catch (error) {
          logger.error('FFmpeg assembly failed — soft fallback', { error: (error as Error).message });
        }
      }
      const srtKey = await storageService.uploadBuffer(Buffer.from(srt, 'utf-8'), 'application/x-subrip', `book-video/${videoProjectId}/final`);
      const vttKey = await storageService.uploadBuffer(Buffer.from(vtt, 'utf-8'), 'text/vtt', `book-video/${videoProjectId}/final`);
      const assKey = await storageService.uploadBuffer(Buffer.from(ass, 'utf-8'), 'text/plain', `book-video/${videoProjectId}/final`);
      await videoProjectRepository.update(videoProjectId, {
        finalVideoUrl: rendered[0].videoUrl, cleanVideoUrl: rendered[0].videoUrl,
        srtUrl: srtKey, vttUrl: vttKey, assUrl: assKey, progress: 100, status: 'COMPLETED',
        errorMessage: failed.length
          ? `${failed.length} scene(s) failed; FFmpeg unavailable — soft subs only`
          : ffmpegOk ? null : 'FFmpeg unavailable — soft subs only; install ffmpeg for full concat',
      });
      break;
    }
    default:
      logger.warn('Unknown book-video job', { name: job.name });
  }
}
