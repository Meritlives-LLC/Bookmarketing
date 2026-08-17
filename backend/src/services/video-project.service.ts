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
    const cost = scenes.length;
    if (user.credits < cost) throw AppError.badRequest(`Insufficient credits. Need ${cost}, have ${user.credits}.`, 'INSUFFICIENT_CREDITS');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { decrement: cost } } });
      await tx.billingEvent.create({ data: { userId, type: 'video_generation_charge', amount: cost, metadata: { videoProjectId: projectId, sceneCount: scenes.length } } });
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
    await videoSceneRepository.updateStatus(sceneId, 'PROMPT_READY', { errorMessage: null, providerGenerationId: null, lastErrorType: null });
    const job = await enqueueGenerateSceneVideo({ videoProjectId: scene.videoProjectId, sceneId });
    return { sceneId, jobId: job?.id ?? null };
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
  async processSceneVideo(sceneId: string): Promise<void> {
    const scene = await videoSceneRepository.findById(sceneId);
    if (!scene) throw AppError.notFound('Scene not found');
    const project = await videoProjectRepository.findById(scene.videoProjectId);
    if (!project) throw AppError.notFound('Project not found');
    if (project.status === 'CANCELED' || project.status === 'PAUSED') return;
    await videoSceneRepository.updateStatus(sceneId, 'GENERATING');
    const provider = getVideoProvider();
    const aspect = project.aspectRatio === 'RATIO_9_16' ? '9:16' : project.aspectRatio === 'RATIO_1_1' ? '1:1' : '16:9';
    const refChars = (project.characters || []).filter((c) => scene.characters.some((n) => n.toLowerCase() === c.name.toLowerCase()));
    const refUrls = refChars.map((c) => c.referenceImageUrl).filter(Boolean) as string[];
    let prompt = scene.visualPrompt || `Cinematic scene: ${scene.sourceText.slice(0, 400)}`;
    for (const c of refChars) {
      if (c.continuityNotes) prompt += `. Character continuity ${c.name}: ${c.continuityNotes.slice(0, 150)}`;
    }
    const result = await provider.generateVideo({
      prompt, negativePrompt: scene.negativePrompt || undefined,
      durationSec: scene.estimatedDurationSec || 6, aspectRatio: aspect,
      model: project.videoModel || undefined, referenceImageUrls: refUrls,
    });
    if (result.status === 'failed') {
      await videoSceneRepository.updateStatus(sceneId, 'FAILED', {
        errorMessage: result.errorMessage, lastErrorType: (result.errorType as any) || 'UNKNOWN',
        retryCount: { increment: 1 },
      });
      return;
    }
    await videoSceneRepository.update(sceneId, { providerGenerationId: result.providerGenerationId, provider: 'GEMINI_VEO' });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await provider.getGenerationStatus(result.providerGenerationId);
      if (status.status === 'completed' && status.videoUrl) {
        let storedUrl = status.videoUrl;
        try {
          const res = await fetch(status.videoUrl);
          if (res.ok) {
            storedUrl = await storageService.uploadBuffer(Buffer.from(await res.arrayBuffer()), 'video/mp4', `book-video/${project.id}/scenes/${sceneId}`);
          }
        } catch (e) {
          logger.warn('Could not re-upload scene video', { error: (e as Error).message });
        }
        await videoSceneRepository.updateStatus(sceneId, 'RENDERED', {
          videoUrl: storedUrl, thumbnailUrl: status.thumbnailUrl || null,
          actualDurationSec: scene.estimatedDurationSec, errorMessage: null,
        });
        await videoProjectRepository.incrementCompletedScenes(project.id);
        const updated = await videoProjectRepository.findById(project.id);
        if (updated?.totalScenes) {
          await videoProjectRepository.update(project.id, {
            progress: Math.min(90, 72 + Math.round((updated.completedScenes / updated.totalScenes) * 18)),
          });
        }
        return;
      }
      if (status.status === 'failed') {
        await videoSceneRepository.updateStatus(sceneId, 'FAILED', {
          errorMessage: status.errorMessage, lastErrorType: (status.errorType as any) || 'UNKNOWN',
          retryCount: { increment: 1 },
        });
        return;
      }
    }
    await videoSceneRepository.updateStatus(sceneId, 'FAILED', {
      errorMessage: 'Timed out waiting for video provider', lastErrorType: 'TIMEOUT',
      retryCount: { increment: 1 },
    });
  },
};
