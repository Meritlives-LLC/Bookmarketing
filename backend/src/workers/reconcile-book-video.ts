import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import {
  enqueueAnalyzeProject, enqueuePlanScenes, enqueueGenerateSceneVideo,
  enqueueAssembleFilm, hasLiveJob,
} from '../queues/book-video.queue';

/**
 * Runs once when the worker boots. Book-to-Film jobs live in Redis via
 * BullMQ; if the worker process crashes, is redeployed mid-job, or Redis
 * itself loses job data (e.g. a non-persistent Redis restart), a project
 * can be left in the database showing an in-progress status (ANALYZING,
 * PLANNING, GENERATING_VIDEO, ASSEMBLING) with nothing actually driving it
 * forward — it would otherwise sit stuck indefinitely with no way to
 * resume, since nothing else in the codebase re-scans for this.
 *
 * This scans for exactly that situation and re-enqueues only the work that
 * is missing a live job. It relies on:
 *  - the deterministic jobIds in book-video.queue.ts, so this can never
 *    create a duplicate of a job that is still genuinely in flight, and
 *  - processSceneVideo's own per-shot skip-if-RENDERED / resume-if-live
 *    logic, so re-enqueuing a scene never regenerates completed or
 *    already-in-flight shots.
 *
 * Must never throw — a failure here should not prevent the worker from
 * starting and processing new work; an orphaned project just stays stuck
 * for one more restart cycle instead.
 */
export async function reconcileStuckBookVideoWork(): Promise<void> {
  try {
    const projects = await prisma.videoProject.findMany({
      where: { status: { in: ['ANALYZING', 'PLANNING', 'GENERATING_VIDEO', 'ASSEMBLING'] } },
      include: { book: { select: { userId: true } }, scenes: { select: { id: true, status: true } } },
    });

    let resumed = 0;
    for (const project of projects) {
      switch (project.status) {
        case 'ANALYZING': {
          if (!(await hasLiveJob(`analyze:${project.id}`))) {
            await enqueueAnalyzeProject({ videoProjectId: project.id, bookId: project.bookId, userId: project.book.userId });
            resumed++;
          }
          break;
        }
        case 'PLANNING': {
          if (!(await hasLiveJob(`plan:${project.id}:all`))) {
            await enqueuePlanScenes({ videoProjectId: project.id, bookId: project.bookId });
            resumed++;
          }
          break;
        }
        case 'GENERATING_VIDEO': {
          // Fully RENDERED scenes have nothing left to resume — skip them so
          // reconciliation doesn't churn out pointless jobs every restart.
          const pendingScenes = project.scenes.filter((s: { status: string }) => s.status !== 'RENDERED');
          for (const scene of pendingScenes) {
            if (!(await hasLiveJob(`scene-video:${scene.id}`))) {
              await enqueueGenerateSceneVideo({ videoProjectId: project.id, sceneId: scene.id });
              resumed++;
            }
          }
          break;
        }
        case 'ASSEMBLING': {
          if (!(await hasLiveJob(`assemble:${project.id}:all`))) {
            await enqueueAssembleFilm({ videoProjectId: project.id });
            resumed++;
          }
          break;
        }
      }
    }

    if (resumed > 0) {
      logger.info('Book-to-Film startup reconciliation resumed orphaned work', {
        resumedJobs: resumed, projectsScanned: projects.length,
      });
    } else {
      logger.info('Book-to-Film startup reconciliation found no orphaned work', {
        projectsScanned: projects.length,
      });
    }
  } catch (error) {
    logger.error('Book-to-Film startup reconciliation failed (worker will still start)', {
      error: (error as Error).message,
    });
  }
}
