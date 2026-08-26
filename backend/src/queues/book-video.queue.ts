import { Queue, JobsOptions } from 'bullmq';
import { bullConnection } from './connection';
import { logger } from '../utils/logger';
import {
  AnalyzeProjectJobData, PlanScenesJobData, GenerateSceneVideoJobData,
  GenerateSubtitlesJobData, AssembleJobData, GenerateReferencesJobData,
} from '../types/book-video.types';

export const bookVideoQueue = bullConnection ? new Queue('book-video', bullConnection) : null;
const defaultJobOpts = { attempts: 3, backoff: { type: 'exponential' as const, delay: 8000 }, removeOnComplete: 50, removeOnFail: 200 };

/**
 * Enqueue a job under a deterministic jobId, deduping at the queue level.
 *
 * A deterministic id means a duplicate enqueue for the same unit of work
 * (double-click, retried API request, two tabs, worker-restart
 * reconciliation re-scanning the DB) can never create a second live job:
 * BullMQ refuses to add a job whose id is already waiting/active/delayed
 * and simply returns the existing one.
 *
 * A *finished* job (completed, or failed past its retries) must not go on
 * blocking a legitimate later retry under the same id, so if a prior job
 * under this id has already reached a terminal state, it's removed first
 * and a fresh job is enqueued in its place. A still-live job is left alone
 * — that's the dedup working as intended.
 */
async function enqueueDeduped(name: string, jobId: string, data: unknown, opts: JobsOptions) {
  if (!bookVideoQueue) { logger.warn(`Redis not configured — ${name} not enqueued`, data as object); return null; }
  const existing = await bookVideoQueue.getJob(jobId);
  if (existing) {
    const [done, failed] = await Promise.all([existing.isCompleted(), existing.isFailed()]);
    if (done || failed) {
      await existing.remove().catch(() => undefined);
    }
  }
  return bookVideoQueue.add(name, data, { ...opts, jobId });
}

export async function enqueueAnalyzeProject(data: AnalyzeProjectJobData) {
  return enqueueDeduped('analyze-project', `analyze:${data.videoProjectId}`, data, defaultJobOpts);
}
export async function enqueuePlanScenes(data: PlanScenesJobData) {
  return enqueueDeduped('plan-scenes', `plan:${data.videoProjectId}:${data.chapterId ?? 'all'}`, data, defaultJobOpts);
}
export async function enqueueGenerateReferences(data: GenerateReferencesJobData) {
  return enqueueDeduped('generate-references', `references:${data.videoProjectId}`, data, defaultJobOpts);
}
export async function enqueueGenerateSceneVideo(data: GenerateSceneVideoJobData) {
  return enqueueDeduped('generate-scene-video', `scene-video:${data.sceneId}`, data, {
    ...defaultJobOpts,
    attempts: 2,
    backoff: { type: 'exponential', delay: 15000 },
  });
}
export async function enqueueGenerateSubtitles(data: GenerateSubtitlesJobData) {
  return enqueueDeduped('generate-subtitles', `subtitles:${data.videoProjectId}:${data.sceneId ?? 'all'}`, data, defaultJobOpts);
}
export async function enqueueAssembleFilm(data: AssembleJobData) {
  return enqueueDeduped('assemble-film', `assemble:${data.videoProjectId}:${data.chapterId ?? 'all'}`, data, defaultJobOpts);
}

/**
 * Verify the Book-to-Film queue infrastructure is actually reachable, not
 * merely configured. Book-to-Film generation is paid — charging a user's
 * credits and then discovering Redis is unreachable (network partition,
 * Redis instance down, auth failure, etc.) is exactly the failure mode this
 * guards against. `bookVideoQueue` being non-null only means a URL was
 * parsed; it says nothing about whether the server is actually up, so this
 * pings the real connection with a short timeout before any credit is
 * touched.
 */
export async function isQueueAvailable(): Promise<boolean> {
  if (!bookVideoQueue) return false;
  try {
    // BullMQ exposes the underlying ioredis client through a narrower
    // interface that omits ping(), although ioredis does provide it.
    const client = await bookVideoQueue.client as unknown as { ping(): Promise<string> };
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis ping timed out')), 3000)),
    ]);
    return pong === 'PONG';
  } catch (error) {
    logger.warn('Book-to-Film queue health check failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Look up whether a live (waiting/active/delayed) job already exists for a
 * given deterministic jobId, without enqueuing anything. Used by startup
 * reconciliation to decide whether DB-reported "in progress" work actually
 * has a job driving it forward, or was orphaned by a worker crash / Redis
 * data loss and needs to be re-enqueued.
 */
export async function hasLiveJob(jobId: string): Promise<boolean> {
  if (!bookVideoQueue) return false;
  const job = await bookVideoQueue.getJob(jobId);
  if (!job) return false;
  const [completed, failed] = await Promise.all([job.isCompleted(), job.isFailed()]);
  return !completed && !failed;
}
