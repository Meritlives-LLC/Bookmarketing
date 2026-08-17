import { Chapter, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ChapterSegment } from '../types/book-video.types';

export const chapterRepository = {
  /** Bulk insert — used once per (re)extraction; no per-row created records needed here. */
  async createMany(manuscriptId: string, segments: ChapterSegment[]): Promise<number> {
    if (segments.length === 0) return 0;
    const result = await prisma.chapter.createMany({
      data: segments.map((segment) => ({
        manuscriptId,
        chapterNumber: segment.chapterNumber,
        title: segment.title,
        sourceText: segment.sourceText,
        wordCount: segment.wordCount,
        startPosition: segment.startPosition,
        endPosition: segment.endPosition,
        extractionMetadata: segment.extractionMetadata as unknown as Prisma.InputJsonValue,
      })),
    });
    return result.count;
  },

  findManyByManuscript(manuscriptId: string): Promise<Chapter[]> {
    return prisma.chapter.findMany({
      where: { manuscriptId },
      orderBy: { chapterNumber: 'asc' },
    });
  },

  findByIdForUser(id: string, userId: string): Promise<Chapter | null> {
    return prisma.chapter.findFirst({
      where: { id, manuscript: { book: { userId } } },
    });
  },

  /** Removes all chapters for a manuscript — used before re-segmenting on manuscript replacement. */
  deleteAllForManuscript(manuscriptId: string): Promise<Prisma.BatchPayload> {
    return prisma.chapter.deleteMany({ where: { manuscriptId } });
  },
};
