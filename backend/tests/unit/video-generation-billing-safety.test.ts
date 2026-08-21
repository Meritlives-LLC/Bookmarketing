/**
 * Regression tests for the P0 billing/queue safety fixes in
 * videoProjectService.startGeneration:
 *
 *  TEST 1: Redis/queue unavailable -> generation fails, no credit charged.
 *  TEST 2: Two simultaneous generation requests racing for the same
 *          balance -> only one may successfully reserve credits.
 *  (bonus) Credits reserved but queue enqueue subsequently fails ->
 *          the reservation is refunded and the project is not left
 *          silently charged with nothing queued.
 *
 * The real Postgres/Redis-backed DB is not available in this environment,
 * so `../../src/config/database` (the shared Prisma client) and the
 * repository/queue modules are mocked at the module boundary. This still
 * exercises the actual decision logic in videoProjectService — the atomic
 * `updateMany({ where: { credits: { gte: cost } } })` reservation, the
 * pre-flight queue health check, and the compensating refund — without
 * requiring a live database.
 */

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  videoShot: {
    count: jest.fn(),
  },
  billingEvent: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockPrisma));

jest.mock('../../src/config/database', () => ({ prisma: mockPrisma }));

const mockVideoProjectRepository = {
  findByIdForUser: jest.fn(),
  updateStatus: jest.fn(),
};
jest.mock('../../src/repositories/video-project.repository', () => ({
  videoProjectRepository: mockVideoProjectRepository,
}));

jest.mock('../../src/repositories/video-scene.repository', () => ({
  videoSceneRepository: { findByIdForUser: jest.fn(), findById: jest.fn(), updateStatus: jest.fn(), update: jest.fn() },
}));
jest.mock('../../src/repositories/book.repository', () => ({
  bookRepository: { findByIdForUser: jest.fn() },
}));
jest.mock('../../src/repositories/manuscript.repository', () => ({
  manuscriptRepository: { findByBookId: jest.fn() },
}));

const mockIsQueueAvailable = jest.fn();
const mockEnqueueGenerateSceneVideo = jest.fn();
jest.mock('../../src/queues/book-video.queue', () => ({
  enqueueAnalyzeProject: jest.fn(),
  enqueuePlanScenes: jest.fn(),
  enqueueGenerateSceneVideo: (...args: unknown[]) => mockEnqueueGenerateSceneVideo(...args),
  enqueueGenerateSubtitles: jest.fn(),
  enqueueAssembleFilm: jest.fn(),
  isQueueAvailable: (...args: unknown[]) => mockIsQueueAvailable(...args),
}));

// Deep dependencies pulled in transitively by video-project.service.ts that
// are irrelevant to startGeneration but must not blow up on import.
jest.mock('../../src/services/video-provider.service', () => ({ getVideoProvider: jest.fn() }));
jest.mock('../../src/services/shot-prompt-compiler.service', () => ({ shotPromptCompilerService: { compile: jest.fn() } }));
jest.mock('../../src/services/ffmpeg-assembly.service', () => ({ ffmpegAssemblyService: { isAvailable: jest.fn(), assemble: jest.fn(), srtToAss: jest.fn() } }));
jest.mock('../../src/services/storage.service', () => ({ storageService: { uploadBuffer: jest.fn(), getObjectBuffer: jest.fn(), publicUrl: jest.fn() } }));

import { videoProjectService } from '../../src/services/video-project.service';

const PROJECT_ID = 'proj-1';
const USER_ID = 'user-1';

function baseProject() {
  return {
    id: PROJECT_ID,
    status: 'GENERATING_SCENES',
    scenes: [
      { id: 'scene-1', status: 'PROMPT_READY' },
      { id: 'scene-2', status: 'PROMPT_READY' },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVideoProjectRepository.findByIdForUser.mockResolvedValue(baseProject());
  mockVideoProjectRepository.updateStatus.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID });
  mockPrisma.videoShot.count.mockResolvedValue(2); // 2 pending shots -> cost 2
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockPrisma));
});

describe('startGeneration — queue unavailable (TEST 1)', () => {
  it('fails cleanly and charges no credits when Redis/BullMQ is unreachable', async () => {
    mockIsQueueAvailable.mockResolvedValue(false);

    await expect(videoProjectService.startGeneration(USER_ID, PROJECT_ID)).rejects.toMatchObject({
      code: 'QUEUE_UNAVAILABLE',
    });

    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.billingEvent.create).not.toHaveBeenCalled();
    expect(mockEnqueueGenerateSceneVideo).not.toHaveBeenCalled();
    // Must never have transitioned the project into GENERATING_VIDEO either.
    expect(mockVideoProjectRepository.updateStatus).not.toHaveBeenCalledWith(
      PROJECT_ID,
      'GENERATING_VIDEO',
      expect.anything()
    );
  });
});

describe('startGeneration — atomic credit reservation (TEST 2)', () => {
  it('only one of two simultaneous requests can reserve the same credits', async () => {
    mockIsQueueAvailable.mockResolvedValue(true);
    mockEnqueueGenerateSceneVideo.mockImplementation(async () => ({ id: 'job-1' }));

    // First request: the atomic updateMany matches (count 1) — reservation succeeds.
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.billingEvent.create.mockResolvedValueOnce({ id: 'billing-1' });
    const first = await videoProjectService.startGeneration(USER_ID, PROJECT_ID);
    expect(first.creditsCharged).toBe(2);

    // Second, "simultaneous" request against the now-lower balance: the
    // atomic updateMany's WHERE clause (credits >= cost) matches zero rows,
    // simulating the balance having already been consumed by the first
    // request. It must fail with INSUFFICIENT_CREDITS, not silently
    // over-decrement.
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ credits: 0 });
    await expect(videoProjectService.startGeneration(USER_ID, PROJECT_ID)).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });

    // The failed reservation must never have created a second billing charge.
    expect(mockPrisma.billingEvent.create).toHaveBeenCalledTimes(1);
  });

  it('uses a single atomic conditional update rather than read-then-decrement', async () => {
    mockIsQueueAvailable.mockResolvedValue(true);
    mockEnqueueGenerateSceneVideo.mockImplementation(async () => ({ id: 'job-1' }));
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.billingEvent.create.mockResolvedValueOnce({ id: 'billing-1' });

    await videoProjectService.startGeneration(USER_ID, PROJECT_ID);

    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: USER_ID, credits: { gte: 2 } }),
        data: expect.objectContaining({ credits: { decrement: 2 } }),
      })
    );
  });
});

describe('startGeneration — compensating refund on enqueue failure', () => {
  it('refunds reserved credits and marks the project FAILED if the queue enqueue fails after charging', async () => {
    mockIsQueueAvailable.mockResolvedValue(true);
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.billingEvent.create.mockResolvedValueOnce({ id: 'billing-1' });
    mockPrisma.billingEvent.findFirst.mockResolvedValue(null);
    // Enqueue throws for the second scene, simulating Redis dying mid-request.
    mockEnqueueGenerateSceneVideo
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(videoProjectService.startGeneration(USER_ID, PROJECT_ID)).rejects.toMatchObject({
      code: 'QUEUE_ENQUEUE_FAILED',
    });

    // Compensation: credits incremented back by the exact reserved amount.
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { credits: { increment: 2 } },
    });
    // An explicit reversal audit record was created.
    expect(mockPrisma.billingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'video_generation_charge_reversal', amount: 2 }),
      })
    );
    // Project must not be left stuck in GENERATING_VIDEO.
    expect(mockVideoProjectRepository.updateStatus).toHaveBeenCalledWith(
      PROJECT_ID,
      'FAILED',
      expect.objectContaining({ errorMessage: expect.stringContaining('not been charged') })
    );
  });
});
