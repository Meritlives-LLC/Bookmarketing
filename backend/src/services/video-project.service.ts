import { VisualStyle, VideoAspectRatio, SubtitleMode, SubtitleStyle, ExtractionStatus } from '@prisma/client';
import { bookRepository } from '../repositories/book.repository';
import { manuscriptRepository } from '../repositories/manuscript.repository';
import { videoProjectRepository } from '../repositories/video-project.repository';
import { videoSceneRepository } from '../repositories/video-scene.repository';
import { prisma } from '../config/database';
import { AppError } from '../utils/helpers';
import { logger } from '../utils/logger';
import { CreateVideoProjectInput, VideoProjectProgress } from '../types/book-video.types';
import {
  enqueueAnalyzeProject, enqueuePlanScenes, enqueueGenerateSceneVideo,
  enqueueGenerateSubtitles, enqueueAssembleFilm,
} from '../queues/book-video.queue';
import { getVideoProvider } from './video-provider.service';
import { storageService } from './storage.service';

const STAGE_LABELS: Record<string, string> = {
  DRAFT: 'Draft', ANALYZING: 'Analyzing manuscript', PLANNING: 'Planning scenes',
  GENERATING_REFERENCES: 'Generating references', GENERATING_SCENES: 'Generating scene prompts',
  GENERATING_VIDEO: 'Generating video', GENERATING_SUBTITLES: 'Generating subtitles',
  ASSEMBLING: 'Assembling film', COMPLETED: 'Completed', FAILED: 'Failed',
  CANCELED: 'Canceled', PAUSED: 'Paused',
};

export const videoProjectService = {
  async create(userId: string, bookId: string, input: CreateVideoProjectInput = {}) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');
    const manuscript = await manuscriptRepository.findByBookId(bookId);
    if (!manuscript) throw AppError.badRequest('Upload the manuscript to generate a full book film.', 'MANUSCRIPT_REQUIRED');
    if (manuscript.extractionStatus !== ExtractionStatus.COMPLETED) {
      throw AppError.badRequest(`Manuscript extraction is ${manuscript.extractionStatus}.`, 'MANUSCRIPT_NOT_READY');
    }
    const chapterCount = await prisma.chapter.count({ where: { manuscriptId: manuscript.id } });
    return videoProjectRepository.create({
      bookId, manuscriptId: manuscript.id, name: input.name || `${book.title} — Film`,
      visualStyle: (input.visualStyle as VisualStyle) || VisualStyle.CINEMATIC_REALISM,
      aspectRatio: (input.aspectRatio as VideoAspectRatio) || VideoAspectRatio.RATIO_16_9,
      resolution: input.resolution, videoModel: input.videoModel,
      subtitleEnabled: input.subtitleEnabled ?? true,
      subtitleMode: (input.subtitleMode as SubtitleMode) || SubtitleMode.SOFT,
      subtitleStyle: (input.subtitleStyle as SubtitleStyle) || SubtitleStyle.CINEMATIC,
      subtitleConfig: input.subtitleConfig, narrationWordsPerMinute: input.narrationWordsPerMinute ?? 150,
      totalChapters: chapterCount,
    });
  },
  async listForBook(userId: string, bookId: string) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');
    return videoProjectRepository.findByBookId(bookId);
  },
  async get(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    return project;
  },
  async getProgress(userId: string, projectId: string): Promise<VideoProjectProgress> {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    const generating = project.scenes?.find((s) => s.status === 'GENERATING');
    return {
      projectId: project.id, status: project.status, progress: project.progress,
      totalChapters: project.totalChapters, totalScenes: project.totalScenes,
      completedScenes: project.completedScenes, currentScene: generating?.sceneNumber ?? null,
      stageLabel: STAGE_LABELS[project.status] || project.status, errorMessage: project.errorMessage,
    };
  },
  async startAnalysis(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (['ANALYZING', 'PLANNING', 'GENERATING_VIDEO', 'ASSEMBLING'].includes(project.status)) {
      throw AppError.conflict('Project is already processing', 'PROJECT_BUSY');
    }
    await videoProjectRepository.updateStatus(projectId, 'ANALYZING', { progress: 1, errorMessage: null });
    const job = await enqueueAnalyzeProject({ videoProjectId: projectId, bookId: project.bookId, userId });
    return { projectId, jobId: job?.id ?? null, status: 'ANALYZING' };
  },
  async startPlanning(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!project.filmBible) throw AppError.badRequest('Run analysis first.');
    await videoProjectRepository.updateStatus(projectId, 'PLANNING', { progress: 61 });
    const job = await enqueuePlanScenes({ videoProjectId: projectId, bookId: project.bookId });
    return { projectId, jobId: job?.id ?? null };
  },
  async startGeneration(userId: string, projectId: string, opts?: { sceneId?: string }) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');
    const scenes = opts?.sceneId
      ? project.scenes.filter((s) => s.id === opts.sceneId)
      : project.scenes.filter((s) => s.status === 'PROMPT_READY' || s.status === 'FAILED');
    if (!scenes.length) throw AppError.badRequest('No scenes ready for generation.');
    // Charge per shot that still needs provider generation (not per scene, not for subtitle/ffmpeg)
    const sceneIds = scenes.map((s) => s.id);
    const pendingShots = await prisma.videoShot.count({
      where: {
        sceneId: { in: sceneIds },
        OR: [{ status: 'PROMPT_READY' }, { status: 'FAILED' }, { status: 'PENDING' }],
      },
    });
    const cost = Math.max(1, pendingShots);
    if (user.credits < cost) throw AppError.badRequest(`Insufficient credits. Need ${cost} (shots), have ${user.credits}.`, 'INSUFFICIENT_CREDITS');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { decrement: cost } } });
      await tx.billingEvent.create({
        data: {
          userId,
          type: 'video_generation_charge',
          amount: cost,
          metadata: { videoProjectId: projectId, sceneCount: scenes.length, shotCount: pendingShots },
        },
      });
    });
    await videoProjectRepository.updateStatus(projectId, 'GENERATING_VIDEO', { progress: 72, errorMessage: null });
    const jobIds: string[] = [];
    for (const scene of scenes) {
      const job = await enqueueGenerateSceneVideo({ videoProjectId: projectId, sceneId: scene.id });
      if (job?.id) jobIds.push(String(job.id));
    }
    return { projectId, enqueued: scenes.length, jobIds, creditsCharged: cost };
  },
  async regenerateScene(userId: string, sceneId: string) {
    const scene = await videoSceneRepository.findByIdForUser(sceneId, userId);
    if (!scene) throw AppError.notFound('Scene not found');
    // Reset only failed/pending shots — keep successfully RENDERED shots
    await prisma.videoShot.updateMany({
      where: { sceneId, status: { in: ['FAILED', 'PENDING', 'PROMPT_READY', 'GENERATING'] } },
      data: { status: 'PROMPT_READY', errorMessage: null, providerGenerationId: null },
    });
    await videoSceneRepository.updateStatus(sceneId, 'PROMPT_READY', {
      errorMessage: null, providerGenerationId: null, lastErrorType: null,
    });
    // No credit charge on retry of already-charged generation
    const job = await enqueueGenerateSceneVideo({ videoProjectId: scene.videoProjectId, sceneId });
    return { sceneId, jobId: job?.id ?? null };
  },

  async regenerateShot(userId: string, shotId: string) {
    const shot = await prisma.videoShot.findFirst({
      where: { id: shotId, scene: { videoProject: { book: { userId } } } },
      include: { scene: true },
    });
    if (!shot) throw AppError.notFound('Shot not found');
    await prisma.videoShot.update({
      where: { id: shotId },
      data: { status: 'PROMPT_READY', errorMessage: null, providerGenerationId: null, videoUrl: null },
    });
    // No credit charge on retry
    await this.processShotVideo(shotId);
    // Re-assemble scene from shots after single shot retry
    await this.processSceneVideo(shot.sceneId);
    return { shotId, sceneId: shot.sceneId };
  },
  async updateScenePrompt(userId: string, sceneId: string, data: { visualPrompt?: string; negativePrompt?: string; cameraPlan?: string }) {
    const scene = await videoSceneRepository.findByIdForUser(sceneId, userId);
    if (!scene) throw AppError.notFound('Scene not found');
    return videoSceneRepository.update(sceneId, {
      visualPrompt: data.visualPrompt ?? scene.visualPrompt,
      negativePrompt: data.negativePrompt ?? scene.negativePrompt,
      cameraPlan: data.cameraPlan ?? scene.cameraPlan,
    });
  },
  async updateShotPrompt(userId: string, shotId: string, data: { visualPrompt?: string; camera?: string; shotType?: string; durationSec?: number }) {
    const shot = await prisma.videoShot.findFirst({ where: { id: shotId, scene: { videoProject: { book: { userId } } } } });
    if (!shot) throw AppError.notFound('Shot not found');
    return prisma.videoShot.update({
      where: { id: shotId },
      data: {
        visualPrompt: data.visualPrompt ?? shot.visualPrompt,
        camera: data.camera ?? shot.camera,
        shotType: data.shotType ?? shot.shotType,
        durationSec: data.durationSec ?? shot.durationSec,
      },
    });
  },
  async updateSubtitleSettings(userId: string, projectId: string, data: { subtitleMode?: string; subtitleStyle?: string; subtitleConfig?: Record<string, unknown>; subtitleEnabled?: boolean }) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    return videoProjectRepository.update(projectId, {
      subtitleEnabled: data.subtitleEnabled ?? project.subtitleEnabled,
      subtitleMode: (data.subtitleMode as SubtitleMode) ?? project.subtitleMode,
      subtitleStyle: (data.subtitleStyle as SubtitleStyle) ?? project.subtitleStyle,
      subtitleConfig: data.subtitleConfig ?? (project.subtitleConfig as object),
    });
  },
  async pause(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    await videoProjectRepository.updateStatus(projectId, 'PAUSED', { pausedAt: new Date() });
    return { projectId, status: 'PAUSED' };
  },
  async resume(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (project.status !== 'PAUSED') throw AppError.badRequest('Project is not paused');
    if (!project.filmBible) return this.startAnalysis(userId, projectId);
    if (!project.scenes?.length) return this.startPlanning(userId, projectId);
    const pending = project.scenes.filter((s) => s.status === 'PROMPT_READY' || s.status === 'FAILED');
    if (pending.length) return this.startGeneration(userId, projectId);
    await videoProjectRepository.updateStatus(projectId, 'ASSEMBLING');
    await enqueueAssembleFilm({ videoProjectId: projectId });
    return { projectId, status: 'ASSEMBLING' };
  },
  async cancel(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    await videoProjectRepository.updateStatus(projectId, 'CANCELED', { canceledAt: new Date() });
    return { projectId, status: 'CANCELED' };
  },
  async generateSubtitles(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!project.subtitleEnabled) throw AppError.badRequest('Subtitles are disabled');
    await videoProjectRepository.updateStatus(projectId, 'GENERATING_SUBTITLES');
    const job = await enqueueGenerateSubtitles({ videoProjectId: projectId });
    return { projectId, jobId: job?.id ?? null };
  },
  async renderFinal(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    await videoProjectRepository.updateStatus(projectId, 'ASSEMBLING', { progress: 90 });
    const job = await enqueueAssembleFilm({ videoProjectId: projectId });
    return { projectId, jobId: job?.id ?? null };
  },
  /**
   * Generate all shots for a scene, then FFmpeg-assemble them into scene.videoUrl.
   * Provider clips are short (per-shot); never one long scene request.
   */
  async processSceneVideo(sceneId: string): Promise<void> {
    const scene = await videoSceneRepository.findById(sceneId);
    if (!scene) throw AppError.notFound('Scene not found');
    const project = await videoProjectRepository.findById(scene.videoProjectId);
    if (!project) throw AppError.notFound('Project not found');
    if (project.status === 'CANCELED' || project.status === 'PAUSED') return;

    await videoSceneRepository.updateStatus(sceneId, 'GENERATING');

    const shots = await prisma.videoShot.findMany({
      where: { sceneId },
      orderBy: { shotNumber: 'asc' },
    });
    if (!shots.length) {
      await videoSceneRepository.updateStatus(sceneId, 'FAILED', {
        errorMessage: 'No shots to generate',
        lastErrorType: 'INVALID_PROMPT',
      });
      return;
    }

    for (const shot of shots) {
      if (shot.status === 'RENDERED' && shot.videoUrl) continue;
      await this.processShotVideo(shot.id);
    }

    // Re-read shots
    const updatedShots = await prisma.videoShot.findMany({
      where: { sceneId },
      orderBy: { shotNumber: 'asc' },
    });
    const failed = updatedShots.filter((s) => s.status === 'FAILED' || !s.videoUrl);
    const rendered = updatedShots.filter((s) => s.status === 'RENDERED' && s.videoUrl);

    if (!rendered.length) {
      await videoSceneRepository.updateStatus(sceneId, 'FAILED', {
        errorMessage: `All ${failed.length} shots failed`,
        lastErrorType: 'UNKNOWN',
        retryCount: { increment: 1 },
      });
      return;
    }

    // Assemble shot clips → scene master
    const { ffmpegAssemblyService } = await import('./ffmpeg-assembly.service');
    const ffmpegOk = await ffmpegAssemblyService.isAvailable();
    let sceneVideoUrl = rendered[0].videoUrl!;
    let actualDuration = rendered.reduce((s, sh) => s + (sh.durationSec || 0), 0);

    if (ffmpegOk && rendered.length >= 1) {
      try {
        const result = await ffmpegAssemblyService.assemble({
          projectId: `${project.id}/scenes/${sceneId}`,
          clips: rendered.map((sh) => ({
            videoUrl: sh.videoUrl!,
            durationSec: sh.durationSec || 4,
          })),
        });
        sceneVideoUrl = result.cleanVideoKey;
        if (result.totalDurationSec > 0) actualDuration = result.totalDurationSec;
      } catch (e) {
        logger.warn('Scene shot assembly failed — using first shot as temporary scene video', {
          error: (e as Error).message,
        });
      }
    }

    await videoSceneRepository.updateStatus(sceneId, failed.length ? 'FAILED' : 'RENDERED', {
      videoUrl: sceneVideoUrl,
      actualDurationSec: actualDuration,
      errorMessage: failed.length
        ? `${failed.length} shot(s) failed; assembled ${rendered.length} shot(s)`
        : null,
    });

    if (!failed.length) {
      await videoProjectRepository.incrementCompletedScenes(project.id);
    }
    const updated = await videoProjectRepository.findById(project.id);
    if (updated?.totalScenes) {
      await videoProjectRepository.update(project.id, {
        progress: Math.min(90, 72 + Math.round((updated.completedScenes / updated.totalScenes) * 18)),
      });
    }
  },

  /** Generate a single shot clip via the video provider. */
  async processShotVideo(shotId: string): Promise<void> {
    const shot = await prisma.videoShot.findUnique({
      where: { id: shotId },
      include: { scene: { include: { videoProject: { include: { characters: true, locations: true, props: true } } } } },
    });
    if (!shot) throw AppError.notFound('Shot not found');
    const scene = shot.scene;
    const project = scene.videoProject;
    if (project.status === 'CANCELED' || project.status === 'PAUSED') return;

    await prisma.videoShot.update({ where: { id: shotId }, data: { status: 'GENERATING', errorMessage: null } });

    const provider = getVideoProvider();
    const aspect = project.aspectRatio === 'RATIO_9_16' ? '9:16' : project.aspectRatio === 'RATIO_1_1' ? '1:1' : '16:9';

    // Continuity: inject canonical character/location/prop profiles
    const refChars = (project.characters || []).filter((c) =>
      scene.characters.some((n) => n.toLowerCase() === c.name.toLowerCase())
    );
    const refLoc = (project.locations || []).find(
      (l) => scene.location && l.name.toLowerCase() === scene.location.toLowerCase()
    );
    const refUrls = [
      ...refChars.map((c) => c.referenceImageUrl).filter(Boolean),
      refLoc?.referenceImageUrl,
    ].filter(Boolean) as string[];

    let prompt = shot.visualPrompt || scene.visualPrompt || `Cinematic shot: ${(shot.sourceTextSegment || scene.sourceText).slice(0, 400)}`;
    for (const c of refChars) {
      if (c.continuityNotes || c.physicalAppearance) {
        prompt += `. Character continuity ${c.name}: ${c.physicalAppearance || ''} ${c.clothing || ''} ${(c.continuityNotes || '').slice(0, 100)}`;
      }
    }
    if (refLoc) {
      prompt += `. Location continuity ${refLoc.name}: ${refLoc.visualDescription || refLoc.environment || ''} ${refLoc.architecture || ''}`;
    }
    if (shot.camera) prompt += `. Camera: ${shot.camera}`;
    if (shot.lens) prompt += `. Lens: ${shot.lens}`;
    if (shot.movement) prompt += `. Movement: ${shot.movement}`;
    if (shot.lighting) prompt += `. Lighting: ${shot.lighting}`;
    if (shot.composition) prompt += `. Composition: ${shot.composition}`;

    const durationSec = Math.min(8, Math.max(2, shot.durationSec || 4));
    const result = await provider.generateVideo({
      prompt,
      negativePrompt: shot.negativePrompt || scene.negativePrompt || undefined,
      durationSec,
      aspectRatio: aspect,
      model: project.videoModel || undefined,
      referenceImageUrls: refUrls,
    });

    if (result.status === 'failed') {
      await prisma.videoShot.update({
        where: { id: shotId },
        data: { status: 'FAILED', errorMessage: result.errorMessage },
      });
      return;
    }

    await prisma.videoShot.update({
      where: { id: shotId },
      data: { providerGenerationId: result.providerGenerationId, status: 'GENERATING' },
    });

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await provider.getGenerationStatus(result.providerGenerationId);
      if (status.status === 'completed' && status.videoUrl) {
        let storedUrl = status.videoUrl;
        try {
          const res = await fetch(status.videoUrl);
          if (res.ok) {
            storedUrl = await storageService.uploadBuffer(
              Buffer.from(await res.arrayBuffer()),
              'video/mp4',
              `book-video/${project.id}/shots/${shotId}`
            );
          }
        } catch (e) {
          logger.warn('Could not re-upload shot video', { error: (e as Error).message });
        }
        await prisma.videoShot.update({
          where: { id: shotId },
          data: { status: 'RENDERED', videoUrl: storedUrl, errorMessage: null },
        });
        return;
      }
      if (status.status === 'failed') {
        await prisma.videoShot.update({
          where: { id: shotId },
          data: { status: 'FAILED', errorMessage: status.errorMessage },
        });
        return;
      }
    }
    await prisma.videoShot.update({
      where: { id: shotId },
      data: { status: 'FAILED', errorMessage: 'Timed out waiting for video provider' },
    });
  },
};
