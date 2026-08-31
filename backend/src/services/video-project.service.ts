import { VisualStyle, VideoAspectRatio, SubtitleMode, SubtitleStyle, ExtractionStatus, ProviderErrorType } from '@prisma/client';
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
  enqueueGenerateSubtitles, enqueueAssembleFilm, isQueueAvailable,
} from '../queues/book-video.queue';
import { getVideoProvider } from './video-provider.service';
import { compileShotPrompt, reasonCameraPlan, validateCameraPlan, normalizeShotCamera, validateCameraContinuity, suggestContinuityFix, type ShotCameraPlan } from '../cinematography';
import { shotPromptCompilerService } from './shot-prompt-compiler.service';
import { ffmpegAssemblyService } from './ffmpeg-assembly.service';
import { narrationService } from './narration.service';
import { storageService } from './storage.service';
import { secureDownloadToBuffer, GOOGLE_PROVIDER_HOSTS } from '../utils/secure-remote-fetch';
import { selectGroundedShotSource, validateSceneGrounding } from './scene-grounding-validator.service';

const STAGE_LABELS: Record<string, string> = {
  DRAFT: 'Draft', ANALYZING: 'Analyzing manuscript', PLANNING: 'Planning scenes',
  GENERATING_REFERENCES: 'Generating references', GENERATING_SCENES: 'Generating scene prompts',
  GENERATING_VIDEO: 'Generating video', GENERATING_SUBTITLES: 'Generating subtitles',
  ASSEMBLING: 'Assembling film', COMPLETED: 'Completed', FAILED: 'Failed',
  CANCELED: 'Canceled', PAUSED: 'Paused',
};

// How long a shot may sit in GENERATING before its providerGenerationId is
// considered abandoned rather than genuinely in flight. Matches the 60 *
// 10s provider poll window in pollShotGeneration, so anything within this
// window is assumed to still have an active poll loop somewhere (or is
// safely resumable), and anything older is safe to treat as dead and retry.
const SHOT_GENERATION_STALE_MS = 10 * 60 * 1000;
/**
 * Cap on how many times a scene may be blocked by pre-generation grounding
 * validation before it is force-failed rather than retried indefinitely.
 * This is separate from provider-error retryCount — a grounding failure
 * means the scene spec itself is wrong (invented character/location), not
 * that the provider hiccuped, so it needs a human to fix the scene, not
 * more automatic attempts.
 */
const MAX_GROUNDING_VALIDATION_ATTEMPTS = 3;

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
      subtitleConfig: input.subtitleConfig as any, narrationWordsPerMinute: input.narrationWordsPerMinute ?? 150,
      narrationVoice: input.narrationVoice,
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
    if (!(await isQueueAvailable())) {
      throw AppError.serviceUnavailable('Video generation is temporarily unavailable (queue infrastructure unreachable). Please try again shortly.', 'QUEUE_UNAVAILABLE');
    }
    await videoProjectRepository.updateStatus(projectId, 'ANALYZING', { progress: 1, errorMessage: null });
    const job = await enqueueAnalyzeProject({ videoProjectId: projectId, bookId: project.bookId, userId });
    if (!job?.id) {
      await videoProjectRepository.updateStatus(projectId, 'FAILED', { errorMessage: 'Could not queue analysis due to an infrastructure error. Please retry.' });
      throw AppError.serviceUnavailable('Could not queue analysis. Please retry.', 'QUEUE_ENQUEUE_FAILED');
    }
    return { projectId, jobId: job.id, status: 'ANALYZING' };
  },
  async startPlanning(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!project.filmBible) throw AppError.badRequest('Run analysis first.');
    if (!(await isQueueAvailable())) {
      throw AppError.serviceUnavailable('Video generation is temporarily unavailable (queue infrastructure unreachable). Please try again shortly.', 'QUEUE_UNAVAILABLE');
    }
    await videoProjectRepository.updateStatus(projectId, 'PLANNING', { progress: 61 });
    const job = await enqueuePlanScenes({ videoProjectId: projectId, bookId: project.bookId });
    if (!job?.id) {
      await videoProjectRepository.updateStatus(projectId, 'FAILED', { errorMessage: 'Could not queue scene planning due to an infrastructure error. Please retry.' });
      throw AppError.serviceUnavailable('Could not queue scene planning. Please retry.', 'QUEUE_ENQUEUE_FAILED');
    }
    return { projectId, jobId: job.id };
  },
  async startGeneration(userId: string, projectId: string, opts?: { sceneId?: string }) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    // Guard against double-submit (double-click, retried request, second
    // tab): without this, two concurrent calls can both read the same
    // PROMPT_READY/FAILED scenes before either has updated status, both
    // charge credits, and both enqueue generation for the same shots.
    if (project.status === 'GENERATING_VIDEO') {
      throw AppError.conflict('Video generation is already running for this project', 'PROJECT_BUSY');
    }
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) throw AppError.notFound('User not found');
    const scenes = opts?.sceneId
      ? project.scenes.filter((s) => s.id === opts.sceneId)
      : project.scenes.filter((s) => s.status === 'PROMPT_READY' || s.status === 'FAILED');
    if (!scenes.length) throw AppError.badRequest('No scenes ready for generation.');

    // P0: verify the queue/Redis infrastructure is actually reachable
    // BEFORE committing a paid generation. If Redis is down, the request
    // must fail cleanly with no credits charged — never silently continue
    // and enqueue nothing.
    if (!(await isQueueAvailable())) {
      throw AppError.serviceUnavailable(
        'Video generation is temporarily unavailable (queue infrastructure unreachable). You have not been charged — please try again shortly.',
        'QUEUE_UNAVAILABLE'
      );
    }

    // Charge per shot that still needs provider generation (not per scene, not for subtitle/ffmpeg)
    const sceneIds = scenes.map((s) => s.id);
    const pendingShots = await prisma.videoShot.count({
      where: {
        sceneId: { in: sceneIds },
        OR: [{ status: 'PROMPT_READY' }, { status: 'FAILED' }, { status: 'PENDING' }],
      },
    });
    const cost = Math.max(1, pendingShots);

    // P0: atomic, race-safe credit reservation. A plain
    // "read credits -> check -> decrement" sequence lets two concurrent
    // requests both observe the same balance and both decrement, allowing
    // overspend. updateMany's WHERE clause is evaluated by Postgres as part
    // of the same atomic statement, so only one of two concurrent requests
    // racing for the same balance can ever match `credits gte cost`; the
    // loser's updateMany matches zero rows and count is 0.
    const reservation = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, credits: { gte: cost } },
        data: { credits: { decrement: cost } },
      });
      if (result.count === 0) return null;
      const billingEvent = await tx.billingEvent.create({
        data: {
          userId,
          type: 'video_generation_charge',
          amount: cost,
          metadata: { videoProjectId: projectId, sceneCount: scenes.length, shotCount: pendingShots, status: 'reserved' },
        },
      });
      return billingEvent;
    });
    if (!reservation) {
      const current = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
      throw AppError.badRequest(`Insufficient credits. Need ${cost} (shots), have ${current?.credits ?? 0}.`, 'INSUFFICIENT_CREDITS');
    }

    await videoProjectRepository.updateStatus(projectId, 'GENERATING_VIDEO', { progress: 72, errorMessage: null });

    // Enqueue every scene's generation job. Credits are already reserved
    // at this point, so if enqueueing fails partway through (e.g. Redis
    // drops mid-request despite the pre-flight check above), the
    // reservation must be compensated rather than left charged against
    // work that was never actually queued.
    const jobIds: string[] = [];
    let enqueueError: unknown = null;
    try {
      for (const scene of scenes) {
        const job = await enqueueGenerateSceneVideo({ videoProjectId: projectId, sceneId: scene.id });
        if (!job?.id) {
          throw new Error(`Failed to enqueue generation for scene ${scene.id} — queue returned no job id`);
        }
        jobIds.push(String(job.id));
      }
    } catch (error) {
      enqueueError = error;
    }

    if (enqueueError || jobIds.length !== scenes.length) {
      // Compensate: refund the full reservation, record an explicit
      // reversal audit record (idempotent — tied to the original
      // reservation's id so retries of this compensation can't double
      // refund), and put the project back into a retryable, non-charged
      // state instead of leaving it stuck in GENERATING_VIDEO.
      await prisma.$transaction(async (tx) => {
        const alreadyReversed = await tx.billingEvent.findFirst({
          where: { type: 'video_generation_charge_reversal', metadata: { path: ['reversalOf'], equals: reservation.id } },
        });
        if (!alreadyReversed) {
          await tx.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
          await tx.billingEvent.create({
            data: {
              userId,
              type: 'video_generation_charge_reversal',
              amount: cost,
              metadata: { videoProjectId: projectId, reversalOf: reservation.id, reason: 'queue enqueue failure' },
            },
          });
        }
      });
      await videoProjectRepository.updateStatus(projectId, 'FAILED', {
        errorMessage: 'Could not queue video generation due to an infrastructure error. You have not been charged — please retry.',
      });
      throw AppError.serviceUnavailable(
        'Video generation could not be queued due to an infrastructure error. Your credits have been refunded — please retry.',
        'QUEUE_ENQUEUE_FAILED'
      );
    }

    return { projectId, enqueued: scenes.length, jobIds, creditsCharged: cost };
  },
  async regenerateScene(userId: string, sceneId: string) {
    const scene = await videoSceneRepository.findByIdForUser(sceneId, userId);
    if (!scene) throw AppError.notFound('Scene not found');
    // Reset failed/pending shots, and any GENERATING shot that's stale
    // (no recorded start time, or older than the provider poll window) —
    // but leave a genuinely live GENERATING shot's providerGenerationId
    // intact so processShotVideo resumes it instead of submitting a
    // duplicate, paid generation for work that may already be finishing.
    const staleCutoff = new Date(Date.now() - SHOT_GENERATION_STALE_MS);
    await prisma.videoShot.updateMany({
      where: {
        sceneId,
        OR: [
          { status: { in: ['FAILED', 'PENDING', 'PROMPT_READY'] } },
          { status: 'GENERATING', OR: [{ generationStartedAt: null }, { generationStartedAt: { lt: staleCutoff } }] },
        ],
      },
      data: { status: 'PROMPT_READY', errorMessage: null, providerGenerationId: null, generationStartedAt: null },
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
    const isLiveGeneration =
      shot.status === 'GENERATING' &&
      !!shot.providerGenerationId &&
      !!shot.generationStartedAt &&
      Date.now() - shot.generationStartedAt.getTime() < SHOT_GENERATION_STALE_MS;
    if (!isLiveGeneration) {
      // Only clear provider state when nothing is genuinely in flight to
      // resume — clearing it under a live generation would orphan a paid,
      // still-running request and cause processShotVideo to duplicate it.
      await prisma.videoShot.update({
        where: { id: shotId },
        data: { status: 'PROMPT_READY', errorMessage: null, providerGenerationId: null, generationStartedAt: null, videoUrl: null },
      });
    }
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
  /**
   * A human correcting the scene's characters/location/source text after
   * a grounding-validation failure deserves a fresh set of validation
   * attempts — otherwise a genuinely-fixed scene stays permanently
   * force-failed from before the correction. This does not bypass
   * validation, it only resets the attempt count so the corrected scene
   * gets evaluated again.
   */
  async updateSceneGrounding(
    userId: string,
    sceneId: string,
    data: { characters?: string[]; location?: string | null; sourceText?: string }
  ) {
    const scene = await videoSceneRepository.findByIdForUser(sceneId, userId);
    if (!scene) throw AppError.notFound('Scene not found');
    return prisma.videoScene.update({
      where: { id: sceneId },
      data: {
        characters: data.characters ?? scene.characters,
        location: data.location !== undefined ? data.location : scene.location,
        sourceText: data.sourceText ?? scene.sourceText,
        groundingValidationAttempts: 0,
        status: 'PROMPT_READY',
        errorMessage: null,
      },
    });
  },
  async updateShotPrompt(userId: string, shotId: string, data: Record<string, unknown>) {
    const shot = await prisma.videoShot.findFirst({
      where: { id: shotId, scene: { videoProject: { book: { userId } } } },
      include: { scene: { include: { videoProject: true } } },
    });
    if (!shot) throw AppError.notFound('Shot not found');

    const patch: Record<string, unknown> = {};
    const allowed = [
      'visualPrompt', 'camera', 'shotType', 'durationSec', 'cameraMovement', 'cameraSpeed',
      'cameraDirection', 'cameraAngle', 'cameraRig', 'lens', 'focalLength', 'framing',
      'composition', 'focusMode', 'depthOfField', 'movementPurpose', 'movement', 'lighting',
      'negativePrompt',
    ];
    for (const f of allowed) {
      if (data[f] !== undefined) patch[f] = data[f];
    }

    const cameraKeys = [
      'cameraMovement', 'cameraSpeed', 'cameraAngle', 'cameraRig', 'lens', 'focalLength',
      'framing', 'movementPurpose', 'depthOfField', 'focusMode', 'composition',
    ];
    const cameraTouched = cameraKeys.some((k) => data[k] !== undefined);
    if (data.recompilePrompt || (cameraTouched && data.visualPrompt === undefined)) {
      const plan: ShotCameraPlan = {
        cameraMovement: (data.cameraMovement as any) || (shot as any).cameraMovement || 'STATIC',
        cameraSpeed: (data.cameraSpeed as any) || (shot as any).cameraSpeed || 'SLOW',
        cameraDirection: (data.cameraDirection as string) ?? (shot as any).cameraDirection,
        cameraAngle: (data.cameraAngle as any) || (shot as any).cameraAngle || 'EYE_LEVEL',
        cameraRig: (data.cameraRig as any) || (shot as any).cameraRig || 'STATIC_TRIPOD',
        lens: (data.lens as string) || shot.lens || '50mm',
        focalLength: (data.focalLength as string) || (shot as any).focalLength || shot.lens || '50mm',
        framing: (data.framing as any) || (shot as any).framing || 'MEDIUM',
        composition: (data.composition as string) || shot.composition || 'rule-of-thirds',
        focusMode: (data.focusMode as any) || (shot as any).focusMode || 'FIXED',
        depthOfField: (data.depthOfField as any) || (shot as any).depthOfField || 'MEDIUM',
        movementPurpose: (data.movementPurpose as any) || (shot as any).movementPurpose || 'FOLLOW_CHARACTER',
        cameraSummary: '',
        movementSummary: '',
      };
      plan.cameraSummary = `${plan.cameraRig} ${plan.cameraMovement}`.toLowerCase().replace(/_/g, ' ');
      plan.movementSummary = `${plan.cameraMovement} @ ${plan.cameraSpeed}`;
      const validation = validateCameraPlan(plan);
      const finalPlan = (!validation.ok && validation.adjusted) ? validation.adjusted : plan;
      const base = (shot.sourceTextSegment || shot.scene.sourceText || '').slice(0, 500);
      const compiled = compileShotPrompt({
        baseVisual: base,
        camera: finalPlan,
        filmStyle: (shot.scene.videoProject as any).visualStyle || undefined,
        negativePrompt: shot.negativePrompt,
      });
      patch.visualPrompt = compiled.prompt;
      patch.negativePrompt = compiled.negativePrompt;
      patch.camera = finalPlan.cameraSummary;
      patch.movement = finalPlan.movementSummary;
      patch.cameraMovement = finalPlan.cameraMovement;
      patch.cameraSpeed = finalPlan.cameraSpeed;
      patch.cameraAngle = finalPlan.cameraAngle;
      patch.cameraRig = finalPlan.cameraRig;
      patch.lens = finalPlan.lens;
      patch.focalLength = finalPlan.focalLength;
      patch.framing = finalPlan.framing;
      patch.focusMode = finalPlan.focusMode;
      patch.depthOfField = finalPlan.depthOfField;
      patch.movementPurpose = finalPlan.movementPurpose;
      patch.composition = finalPlan.composition;
    }

    return prisma.videoShot.update({ where: { id: shotId }, data: patch as any });
  },
  /**
   * AI-generate structured camera for one shot (does not regenerate video).
   * Manual overrides remain the source of truth after user edits.
   */
  /**
   * Soft-fix camera params toward previous shot (camera fields only).
   * Does not change source text, characters, locations, or story.
   * Does not auto-regenerate video.
   */
  async fixCameraContinuity(userId: string, shotId: string) {
    const shot = await prisma.videoShot.findFirst({
      where: { id: shotId, scene: { videoProject: { book: { userId } } } },
      include: { scene: true },
    });
    if (!shot) throw AppError.notFound('Shot not found');
    const siblings = await prisma.videoShot.findMany({
      where: { sceneId: shot.sceneId },
      orderBy: { shotNumber: 'asc' },
    });
    const idx = siblings.findIndex((s) => s.id === shotId);
    if (idx <= 0) {
      return { shot, message: 'First shot in scene — no previous shot to align with' };
    }
    const prev = siblings[idx - 1];
    const fixed = suggestContinuityFix(
      {
        camera: prev.camera,
        movement: prev.movement,
        lens: prev.lens,
        cameraMovement: prev.cameraMovement as any,
        cameraSpeed: prev.cameraSpeed as any,
        cameraDirection: prev.cameraDirection,
        cameraAngle: prev.cameraAngle as any,
        cameraRig: prev.cameraRig as any,
        framing: prev.framing as any,
        focalLength: prev.focalLength,
        focusMode: prev.focusMode as any,
        depthOfField: prev.depthOfField as any,
        movementPurpose: prev.movementPurpose as any,
      },
      {
        camera: shot.camera,
        movement: shot.movement,
        lens: shot.lens,
        cameraMovement: shot.cameraMovement as any,
        cameraSpeed: shot.cameraSpeed as any,
        cameraDirection: shot.cameraDirection,
        cameraAngle: shot.cameraAngle as any,
        cameraRig: shot.cameraRig as any,
        framing: shot.framing as any,
        focalLength: shot.focalLength,
        focusMode: shot.focusMode as any,
        depthOfField: shot.depthOfField as any,
        movementPurpose: shot.movementPurpose as any,
      }
    );

    // Recompile prompt from fixed camera only
    const compiled = shotPromptCompilerService.compile({
      sourceTextSegment: shot.sourceTextSegment || shot.scene.sourceText,
      durationSec: shot.durationSec,
      shot: {
        cameraMovement: fixed.cameraMovement,
        cameraSpeed: fixed.cameraSpeed,
        cameraAngle: fixed.cameraAngle,
        cameraRig: fixed.cameraRig,
        framing: fixed.framing,
        lens: fixed.lens,
        focalLength: fixed.focalLength,
        focusMode: fixed.focusMode,
        depthOfField: fixed.depthOfField,
        movementPurpose: fixed.movementPurpose,
        composition: fixed.composition,
      },
    });

    const continuity = validateCameraContinuity(
      {
        cameraMovement: prev.cameraMovement as any,
        cameraSpeed: prev.cameraSpeed as any,
        cameraRig: prev.cameraRig as any,
        framing: prev.framing as any,
        focalLength: prev.focalLength,
        lens: prev.lens,
        movementPurpose: prev.movementPurpose as any,
      },
      {
        cameraMovement: fixed.cameraMovement,
        cameraSpeed: fixed.cameraSpeed,
        cameraRig: fixed.cameraRig,
        framing: fixed.framing,
        focalLength: fixed.focalLength,
        lens: fixed.lens,
        movementPurpose: fixed.movementPurpose,
      }
    );

    const updated = await prisma.videoShot.update({
      where: { id: shotId },
      data: {
        cameraMovement: fixed.cameraMovement,
        cameraSpeed: fixed.cameraSpeed,
        cameraAngle: fixed.cameraAngle,
        cameraRig: fixed.cameraRig,
        lens: fixed.lens,
        focalLength: fixed.focalLength,
        framing: fixed.framing,
        composition: fixed.composition,
        focusMode: fixed.focusMode,
        depthOfField: fixed.depthOfField,
        movementPurpose: fixed.movementPurpose,
        camera: fixed.cameraSummary,
        movement: fixed.movementSummary,
        visualPrompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        cameraContinuityWarnings: {
          valid: continuity.valid,
          severity: continuity.severity,
          score: continuity.score,
          issues: continuity.issues,
          suggestions: continuity.suggestions,
          fixedAt: new Date().toISOString(),
        } as any,
      },
    });
    return { shot: updated, continuity };
  },

  async generateCameraForShot(userId: string, shotId: string) {
    const shot = await prisma.videoShot.findFirst({
      where: { id: shotId, scene: { videoProject: { book: { userId } } } },
      include: {
        scene: {
          include: {
            videoProject: { include: { characters: true, locations: true } },
          },
        },
      },
    });
    if (!shot) throw AppError.notFound('Shot not found');
    const scene = shot.scene;
    const siblings = await prisma.videoShot.findMany({
      where: { sceneId: scene.id },
      orderBy: { shotNumber: 'asc' },
    });
    const idx = siblings.findIndex((s) => s.id === shotId);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const previousPlan = prev
      ? normalizeShotCamera({
          camera: prev.camera,
          movement: prev.movement,
          lens: prev.lens,
          cameraMovement: prev.cameraMovement as any,
          cameraSpeed: prev.cameraSpeed as any,
          cameraAngle: prev.cameraAngle as any,
          cameraRig: prev.cameraRig as any,
          framing: prev.framing as any,
          focalLength: prev.focalLength,
          focusMode: prev.focusMode as any,
          depthOfField: prev.depthOfField as any,
          movementPurpose: prev.movementPurpose as any,
        })
      : null;

    const plan = reasonCameraPlan({
      shotNumber: shot.shotNumber,
      totalShotsInScene: siblings.length,
      shotType: shot.shotType,
      action: shot.action || scene.action,
      emotionalBeat: scene.emotionalBeat,
      locationKind: 'unknown',
      locationScale: 'unknown',
      intensity: 'medium',
      previous: previousPlan,
    });

    const compiled = shotPromptCompilerService.compile({
      sourceTextSegment: selectGroundedShotSource(scene.sourceText, shot.sourceTextSegment),
      filmStyle: scene.videoProject.visualStyle || undefined,
      durationSec: shot.durationSec,
      shot: {
        ...plan,
        cameraMovement: plan.cameraMovement,
        cameraSpeed: plan.cameraSpeed,
        cameraAngle: plan.cameraAngle,
        cameraRig: plan.cameraRig,
        framing: plan.framing,
        lens: plan.lens,
        focalLength: plan.focalLength,
        focusMode: plan.focusMode,
        depthOfField: plan.depthOfField,
        movementPurpose: plan.movementPurpose,
      },
    });

    const updated = await prisma.videoShot.update({
      where: { id: shotId },
      data: {
        cameraMovement: plan.cameraMovement,
        cameraSpeed: plan.cameraSpeed,
        cameraAngle: plan.cameraAngle,
        cameraRig: plan.cameraRig,
        lens: plan.lens,
        focalLength: plan.focalLength,
        framing: plan.framing,
        composition: plan.composition,
        focusMode: plan.focusMode,
        depthOfField: plan.depthOfField,
        movementPurpose: plan.movementPurpose,
        camera: plan.cameraSummary,
        movement: plan.movementSummary,
        visualPrompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        // Keep status; do not auto-regenerate video
      },
    });
    return { shot: updated, warnings: compiled.warnings };
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
    if (!(await isQueueAvailable())) {
      throw AppError.serviceUnavailable('Video generation is temporarily unavailable (queue infrastructure unreachable). Please try again shortly.', 'QUEUE_UNAVAILABLE');
    }
    await videoProjectRepository.updateStatus(projectId, 'GENERATING_SUBTITLES');
    const job = await enqueueGenerateSubtitles({ videoProjectId: projectId });
    if (!job?.id) {
      await videoProjectRepository.updateStatus(projectId, 'FAILED', { errorMessage: 'Could not queue subtitle generation due to an infrastructure error. Please retry.' });
      throw AppError.serviceUnavailable('Could not queue subtitle generation. Please retry.', 'QUEUE_ENQUEUE_FAILED');
    }
    return { projectId, jobId: job.id };
  },
  async renderFinal(userId: string, projectId: string) {
    const project = await videoProjectRepository.findByIdForUser(projectId, userId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!(await isQueueAvailable())) {
      throw AppError.serviceUnavailable('Video generation is temporarily unavailable (queue infrastructure unreachable). Please try again shortly.', 'QUEUE_UNAVAILABLE');
    }
    await videoProjectRepository.updateStatus(projectId, 'ASSEMBLING', { progress: 90 });
    const job = await enqueueAssembleFilm({ videoProjectId: projectId });
    if (!job?.id) {
      await videoProjectRepository.updateStatus(projectId, 'FAILED', { errorMessage: 'Could not queue final assembly due to an infrastructure error. Please retry.' });
      throw AppError.serviceUnavailable('Could not queue final assembly. Please retry.', 'QUEUE_ENQUEUE_FAILED');
    }
    return { projectId, jobId: job.id };
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

    // Assemble shot clips → scene master. A scene with more than one shot
    // genuinely needs FFmpeg to concatenate them; if that concat throws,
    // falling back to shot 1's clip while still marking the scene RENDERED
    // would silently drop the rest of the scene's shots while reporting
    // success — the same "claim success without verifying" failure mode as
    // project-level assembly, just one level down. A single-shot scene has
    // nothing to concatenate, so its one clip is legitimately the scene.
    const ffmpegOk = await ffmpegAssemblyService.isAvailable();
    let sceneVideoUrl: string | null = rendered[0].videoUrl!;
    let actualDuration = rendered.reduce((s, sh) => s + (sh.durationSec || 0), 0);
    let assemblyFailed = false;

    if (rendered.length > 1) {
      if (ffmpegOk) {
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
          logger.warn('Scene shot assembly failed', { error: (e as Error).message, sceneId });
          assemblyFailed = true;
        }
      } else {
        assemblyFailed = true;
      }
    }

    await videoSceneRepository.updateStatus(sceneId, failed.length || assemblyFailed ? 'FAILED' : 'RENDERED', {
      videoUrl: assemblyFailed ? null : sceneVideoUrl,
      actualDurationSec: actualDuration,
      errorMessage: assemblyFailed
        ? `Failed to assemble ${rendered.length} shot clips into the scene video (${!ffmpegOk ? 'FFmpeg unavailable' : 'FFmpeg error'}). All shots rendered individually; retry the scene to re-assemble.`
        : failed.length
          ? `${failed.length} shot(s) failed; assembled ${rendered.length} shot(s)`
          : null,
    });

    if (!failed.length && !assemblyFailed) {
      await videoProjectRepository.incrementCompletedScenes(project.id);

      // Narration is generated once the scene's video is confirmed
      // RENDERED, from the scene's own narrationText — not from any Veo
      // output. A narration failure here is logged and left for retry; it
      // must never fail or revert the scene's RENDERED status, since the
      // video itself did succeed and assemble-film already tolerates a
      // missing narrationAudioUrl per clip.
      if (project.narrationVoice) {
        try {
          const rerendered = await videoSceneRepository.findById(sceneId);
          if (rerendered?.narrationText?.trim()) {
            const narration = await narrationService.generate({
              text: rerendered.narrationText,
              voiceId: project.narrationVoice,
            });
            await videoSceneRepository.update(sceneId, {
              narrationAudioUrl: narration.audioKey,
              narrationDurationSec: narration.durationSec,
            });
          }
        } catch (e) {
          logger.error('Narration generation failed for scene (non-fatal)', {
            sceneId, error: (e as Error).message,
          });
        }
      }
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
      include: { scene: { include: { chapter: true, videoProject: { include: { characters: true, locations: true, props: true } } } } },
    });
    if (!shot) throw AppError.notFound('Shot not found');
    const scene = shot.scene;
    const project = scene.videoProject;
    if (project.status === 'CANCELED' || project.status === 'PAUSED') return;

    // Hard gate: a scene must be traceable to actual book content before
    // it is allowed to reach the (paid) video provider. This checks the
    // scene's own characters/location against this project's book-derived
    // character/location bibles and against the scene's own source text —
    // it does not invent or assume anything, it only blocks scenes that
    // fail that trace. A scene that keeps failing this after several
    // attempts needs a human to fix the underlying scene spec, not more
    // automatic retries, so it is force-failed rather than retried
    // indefinitely.
    const grounding = validateSceneGrounding(
      {
        sourceText: scene.sourceText,
        contextText: scene.chapter.sourceText.slice(Math.max(0, (scene.sourceStart ?? 0) - 700), scene.sourceStart ?? 0),
        characters: scene.characters,
        location: scene.location,
        props: scene.props,
        // A shot may stage a small, source-supported sub-action (approach,
        // opening a door) but may never replace its parent event.
        action: shot.action ?? scene.action,
        emotionalBeat: scene.emotionalBeat,
      },
      project.characters || [],
      project.locations || [],
      project.props || []
    );
    if (!grounding.ok) {
      const attempts = scene.groundingValidationAttempts ?? 0;
      logger.warn('Scene failed pre-generation grounding validation', {
        sceneId: scene.id, shotId, attempts, issues: grounding.issues,
      });
      if (attempts + 1 >= MAX_GROUNDING_VALIDATION_ATTEMPTS) {
        await prisma.videoScene.update({
          where: { id: scene.id },
          data: {
            status: 'FAILED',
            groundingValidationAttempts: attempts + 1,
            errorMessage: `Scene failed book-content validation after ${attempts + 1} attempts: ${grounding.issues.join(' ')}`,
            lastErrorType: 'INVALID_PROMPT',
          },
        });
        await prisma.videoShot.update({
          where: { id: shotId },
          data: {
            status: 'FAILED',
            errorMessage: `Blocked by pre-generation grounding validation: ${grounding.issues.join(' ')}`,
            lastErrorType: 'INVALID_PROMPT',
          },
        });
      } else {
        await prisma.videoScene.update({
          where: { id: scene.id },
          data: {
            status: 'NEEDS_REVIEW',
            groundingValidationAttempts: attempts + 1,
            errorMessage: `Scene needs review before generation: ${grounding.issues.join(' ')}`,
          },
        });
      }
      // Never send an ungrounded scene to the provider — no video is
      // generated, no cost is incurred, regardless of attempt count.
      return;
    }

    const provider = getVideoProvider();

    // Idempotency guard: if this shot already has an in-flight provider
    // generation (e.g. the job was retried by BullMQ, delivered twice, or
    // the worker crashed mid-poll after already submitting to the provider),
    // resume polling that existing generation instead of submitting a new,
    // separately-billed request. Only resubmit if the prior attempt is
    // clearly stale (no start time recorded, or older than the max wait
    // window below) — that indicates the earlier submission itself likely
    // never completed and is safe to abandon.
    const STALE_GENERATION_MS = SHOT_GENERATION_STALE_MS; // matches the 60 * 10s poll window below
    if (
      shot.status === 'GENERATING' &&
      shot.providerGenerationId &&
      shot.generationStartedAt &&
      Date.now() - shot.generationStartedAt.getTime() < STALE_GENERATION_MS
    ) {
      logger.info('Resuming in-flight shot generation instead of resubmitting', {
        shotId,
        providerGenerationId: shot.providerGenerationId,
      });
      await this.pollShotGeneration(shotId, shot.providerGenerationId, provider);
      return;
    }

    await prisma.videoShot.update({
      where: { id: shotId },
      data: { status: 'GENERATING', errorMessage: null, generationStartedAt: new Date() },
    });
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

    const compiled = shotPromptCompilerService.compile({
      sourceTextSegment: selectGroundedShotSource(scene.sourceText, shot.sourceTextSegment),
      visualPrompt: shot.visualPrompt,
      negativePrompt: shot.negativePrompt || scene.negativePrompt,
      filmStyle: project.visualStyle || undefined,
      characters: refChars.map((c) => ({
        name: c.name,
        physicalAppearance: c.physicalAppearance,
        clothing: c.clothing,
        continuityNotes: c.continuityNotes,
        referenceImageUrl: c.referenceImageUrl,
      })),
      location: refLoc
        ? {
            name: refLoc.name,
            visualDescription: refLoc.visualDescription,
            environment: refLoc.environment,
            architecture: refLoc.architecture,
            continuityNotes: refLoc.continuityNotes,
            country: (refLoc as any).country,
            city: (refLoc as any).city,
            region: (refLoc as any).region,
            culturalContext: (refLoc as any).culturalContext,
          }
        : null,
      durationSec: shot.durationSec,
      shot: {
        camera: shot.camera,
        movement: shot.movement,
        lens: shot.lens,
        composition: shot.composition,
        lighting: shot.lighting,
        shotType: shot.shotType,
        cameraMovement: shot.cameraMovement as any,
        cameraSpeed: shot.cameraSpeed as any,
        cameraAngle: shot.cameraAngle as any,
        cameraRig: shot.cameraRig as any,
        framing: shot.framing as any,
        focalLength: shot.focalLength,
        focusMode: shot.focusMode as any,
        depthOfField: shot.depthOfField as any,
        movementPurpose: shot.movementPurpose as any,
        focusTarget: (shot as any).focusTarget,
        cameraDirection: shot.cameraDirection,
        durationSec: shot.durationSec,
      },
    });
    // The final provider prompt is always rebuilt from the grounded source
    // segment and canonical continuity state. A stored AI shot prompt can be
    // useful for editing/display, but must not bypass the evidence gate and
    // introduce a new action after validation.
    const prompt = compiled.prompt;

    // Advisory continuity check — NEVER blocks generation
    try {
      const siblings = await prisma.videoShot.findMany({
        where: { sceneId: scene.id },
        orderBy: { shotNumber: 'asc' },
      });
      const idx = siblings.findIndex((s) => s.id === shotId);
      const prevShot = idx > 0 ? siblings[idx - 1] : null;
      const continuity = validateCameraContinuity(
        prevShot
          ? {
              camera: prevShot.camera,
              movement: prevShot.movement,
              lens: prevShot.lens,
              cameraMovement: prevShot.cameraMovement as any,
              cameraSpeed: prevShot.cameraSpeed as any,
              cameraDirection: prevShot.cameraDirection,
              cameraAngle: prevShot.cameraAngle as any,
              cameraRig: prevShot.cameraRig as any,
              framing: prevShot.framing as any,
              focalLength: prevShot.focalLength,
              focusMode: prevShot.focusMode as any,
              depthOfField: prevShot.depthOfField as any,
              movementPurpose: prevShot.movementPurpose as any,
              durationSec: prevShot.durationSec,
            }
          : null,
        {
          camera: shot.camera,
          movement: shot.movement,
          lens: shot.lens,
          cameraMovement: shot.cameraMovement as any,
          cameraSpeed: shot.cameraSpeed as any,
          cameraDirection: shot.cameraDirection,
          cameraAngle: shot.cameraAngle as any,
          cameraRig: shot.cameraRig as any,
          framing: shot.framing as any,
          focalLength: shot.focalLength,
          focusMode: shot.focusMode as any,
          depthOfField: shot.depthOfField as any,
          movementPurpose: shot.movementPurpose as any,
          durationSec: shot.durationSec,
          action: shot.action,
        },
        {
          emotionalBeat: scene.emotionalBeat,
          locationKind: 'unknown',
          locationScale: 'unknown',
        }
      );
      await prisma.videoShot.update({
        where: { id: shotId },
        data: {
          cameraContinuityWarnings: {
            valid: continuity.valid,
            severity: continuity.severity,
            score: continuity.score,
            issues: continuity.issues,
            suggestions: continuity.suggestions,
            checkedAt: new Date().toISOString(),
          } as any,
        },
      });
      if (continuity.issues.length) {
        logger.info('Camera continuity advisory', {
          shotId,
          severity: continuity.severity,
          score: continuity.score,
          issueCount: continuity.issues.length,
        });
      }
    } catch (e) {
      logger.warn('Continuity check failed (non-blocking)', { error: (e as Error).message });
    }

    const durationSec = Math.min(8, Math.max(2, shot.durationSec || 4));
    const result = await provider.generateVideo({
      prompt,
      negativePrompt: compiled.negativePrompt || shot.negativePrompt || scene.negativePrompt || undefined,
      durationSec,
      aspectRatio: aspect,
      model: project.videoModel || undefined,
      referenceImageUrls: refUrls,
    });

    if (result.status === 'failed') {
      await prisma.videoShot.update({
        where: { id: shotId },
        data: {
          status: 'FAILED',
          errorMessage: result.errorMessage,
          lastErrorType: (result.errorType as ProviderErrorType) ?? 'UNKNOWN',
          retryCount: { increment: 1 },
        },
      });
      return;
    }

    await prisma.videoShot.update({
      where: { id: shotId },
      data: { providerGenerationId: result.providerGenerationId, status: 'GENERATING', generationStartedAt: new Date() },
    });

    await this.pollShotGeneration(shotId, result.providerGenerationId, provider, project.id);
  },

  /**
   * Poll an already-submitted provider generation to completion. Extracted
   * so a resumed (already in-flight) generation and a freshly-submitted one
   * share identical completion/failure handling, and so a worker crash mid-
   * poll never causes a second billed generateVideo() call for the same shot.
   */
  async pollShotGeneration(
    shotId: string,
    providerGenerationId: string,
    provider: ReturnType<typeof getVideoProvider>,
    projectId?: string
  ): Promise<void> {
    let consecutivePollErrors = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await provider.getGenerationStatus(providerGenerationId);

      // A poll-call error (network blip, transient 5xx) is NOT the same as
      // the provider reporting genuine failure — treating every hiccup as a
      // terminal failure would kill an otherwise-succeeding, already-paid
      // generation and (since FAILED shots are eligible for resubmission)
      // risk a second, duplicate billed provider call. Only a small number
      // of *consecutive* errors is treated as dead; an isolated blip is
      // retried on the next poll tick.
      if (status.status === 'failed' && status.errorType === 'TIMEOUT' && !status.videoUrl) {
        consecutivePollErrors++;
        if (consecutivePollErrors < 3) {
          logger.warn('Transient error polling provider status — will retry', {
            shotId, providerGenerationId, attempt: consecutivePollErrors,
          });
          continue;
        }
      } else {
        consecutivePollErrors = 0;
      }

      if (status.status === 'completed' && status.videoUrl) {
        // P0: a provider-generated video is not durably RENDERED until it
        // has been downloaded and re-uploaded to our own storage. A
        // provider URL is typically short-lived/signed — silently marking
        // the shot RENDERED with that temporary URL when our own upload
        // fails would look successful right up until the link expires.
        try {
          // Provider-returned video URLs are not blindly fetched: only the
          // known Gemini/Veo hosts are allowed, the response is streamed
          // and size-capped rather than buffered in one shot via
          // arrayBuffer(), and redirects/private-IP targets are rejected.
          // This is the same SSRF-hardened path FFmpeg's clip downloader
          // uses (see secure-remote-fetch.ts).
          const videoBuffer = await secureDownloadToBuffer(status.videoUrl, {
            allowedHosts: GOOGLE_PROVIDER_HOSTS,
            maxBytes: 300 * 1024 * 1024,
            allowedContentTypePrefixes: ['video/', 'application/octet-stream'],
          });
          const storedUrl = await storageService.uploadBuffer(
            videoBuffer,
            'video/mp4',
            `book-video/${projectId ?? 'unknown'}/shots/${shotId}`
          );
          await prisma.videoShot.update({
            where: { id: shotId },
            data: { status: 'RENDERED', videoUrl: storedUrl, errorMessage: null },
          });
        } catch (e) {
          // Durable storage failed even though the provider succeeded.
          // Preserve providerGenerationId so a retry resumes/re-fetches
          // this same completed generation instead of submitting (and
          // billing for) a brand new one — processShotVideo's idempotency
          // guard only resumes GENERATING shots with a live
          // providerGenerationId, so keep status GENERATING here rather
          // than FAILED (which would clear that path) and let the next
          // regeneration attempt re-download from the provider.
          logger.error('Durable storage upload failed after provider success — shot NOT marked rendered', {
            shotId, providerGenerationId, error: (e as Error).message,
          });
          await prisma.videoShot.update({
            where: { id: shotId },
            data: {
              status: 'FAILED',
              errorMessage: `Video generated by provider but could not be saved to durable storage: ${(e as Error).message}`,
              lastErrorType: 'STORAGE_ERROR' as ProviderErrorType,
              retryCount: { increment: 1 },
            },
          });
        }
        return;
      }
      if (status.status === 'failed') {
        await prisma.videoShot.update({
          where: { id: shotId },
          data: {
            status: 'FAILED',
            errorMessage: status.errorMessage,
            lastErrorType: (status.errorType as ProviderErrorType) ?? 'UNKNOWN',
            retryCount: { increment: 1 },
          },
        });
        return;
      }
      // status === 'processing' (or unknown-but-not-failed): keep polling.
    }
    // Our polling window elapsed without the provider reporting completion
    // or failure — this does NOT mean the provider generation itself
    // failed; it may still be processing on the provider's side. Do not
    // mark the shot FAILED here: that would make it eligible for immediate
    // resubmission (a second, duplicate billed provider call) for work
    // that might still complete. Instead leave status/providerGenerationId
    // as-is; processShotVideo and regenerateScene both already treat a
    // GENERATING shot older than SHOT_GENERATION_STALE_MS as safely
    // resumable/re-triable, which is the correct recovery path here.
    logger.warn('Provider poll window elapsed without a terminal status — leaving shot for staleness-based recovery', {
      shotId, providerGenerationId,
    });
  },
};
