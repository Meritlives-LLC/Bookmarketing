import { Queue } from 'bullmq';
import { bullConnection } from './connection';
import { logger } from '../utils/logger';
import {
  AnalyzeProjectJobData, PlanScenesJobData, GenerateSceneVideoJobData,
  GenerateSubtitlesJobData, AssembleJobData, GenerateReferencesJobData,
} from '../types/book-video.types';

export const bookVideoQueue = bullConnection ? new Queue('book-video', bullConnection) : null;
const defaultJobOpts = { attempts: 3, backoff: { type: 'exponential' as const, delay: 8000 }, removeOnComplete: 50, removeOnFail: 200 };

export async function enqueueAnalyzeProject(data: AnalyzeProjectJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — analyze not enqueued', data); return null; }
  return bookVideoQueue.add('analyze-project', data, defaultJobOpts);
}
export async function enqueuePlanScenes(data: PlanScenesJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — plan not enqueued', data); return null; }
  return bookVideoQueue.add('plan-scenes', data, defaultJobOpts);
}
export async function enqueueGenerateReferences(data: GenerateReferencesJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — references not enqueued', data); return null; }
  return bookVideoQueue.add('generate-references', data, defaultJobOpts);
}
export async function enqueueGenerateSceneVideo(data: GenerateSceneVideoJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — scene video not enqueued', data); return null; }
  // Deterministic jobId dedupes concurrent/duplicate enqueues for the same
  // scene (double-click "Generate", a retried API request, two tabs, etc.):
  // BullMQ refuses to add a second job with an id that is already
  // waiting/active/delayed, returning the existing job instead — so a live
  // in-flight generation is never duplicated.
  //
  // A *finished* job (completed or failed) with this id must not block a
  // legitimate later retry (e.g. regenerateScene after a failure), so if a
  // prior job under this id has already reached a terminal state, remove it
  // first and enqueue fresh. A still-live job (active/waiting/delayed) is
  // left alone and returned as-is — that's the dedup working as intended.
  const jobId = `scene-video:${data.sceneId}`;
  const existing = await bookVideoQueue.getJob(jobId);
  if (existing) {
    const [done, failed] = await Promise.all([existing.isCompleted(), existing.isFailed()]);
    if (done || failed) {
      await existing.remove().catch(() => undefined);
    }
  }
  return bookVideoQueue.add('generate-scene-video', data, {
    ...defaultJobOpts,
    attempts: 2,
    backoff: { type: 'exponential', delay: 15000 },
    jobId,
  });
}
export async function enqueueGenerateSubtitles(data: GenerateSubtitlesJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — subtitles not enqueued', data); return null; }
  return bookVideoQueue.add('generate-subtitles', data, defaultJobOpts);
}
export async function enqueueAssembleFilm(data: AssembleJobData) {
  if (!bookVideoQueue) { logger.warn('Redis not configured — assemble not enqueued', data); return null; }
  return bookVideoQueue.add('assemble-film', data, defaultJobOpts);
}
