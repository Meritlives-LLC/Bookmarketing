import { prisma } from '../config/database';
import { VideoProjectStatus, VisualStyle, VideoAspectRatio, SubtitleMode, SubtitleStyle, Prisma } from '@prisma/client';

export const videoProjectRepository = {
  async create(data: {
    bookId: string; manuscriptId: string; name: string;
    visualStyle?: VisualStyle; aspectRatio?: VideoAspectRatio; resolution?: string;
    videoModel?: string; subtitleEnabled?: boolean; subtitleMode?: SubtitleMode;
    subtitleStyle?: SubtitleStyle; subtitleConfig?: Prisma.InputJsonValue;
    narrationWordsPerMinute?: number; totalChapters?: number;
  }) {
    return prisma.videoProject.create({ data });
  },
  async findById(id: string) {
    return prisma.videoProject.findUnique({
      where: { id },
      include: {
        filmBible: true, characters: true, locations: true, props: true,
        scenes: {
          orderBy: [{ chapterId: 'asc' }, { sceneNumber: 'asc' }],
          include: { shots: { orderBy: { shotNumber: 'asc' } }, subtitleCues: { orderBy: { sequence: 'asc' } } },
        },
        manuscript: { include: { chapters: { orderBy: { chapterNumber: 'asc' } } } },
        book: true,
      },
    });
  },
  async findByIdForUser(id: string, userId: string) {
    return prisma.videoProject.findFirst({
      where: { id, book: { userId } },
      include: {
        filmBible: true, characters: true, locations: true, props: true,
        scenes: {
          orderBy: [{ chapterId: 'asc' }, { sceneNumber: 'asc' }],
          include: { shots: { orderBy: { shotNumber: 'asc' } }, subtitleCues: { orderBy: { sequence: 'asc' } } },
        },
        manuscript: { include: { chapters: { orderBy: { chapterNumber: 'asc' } } } },
        book: true,
      },
    });
  },
  async findByBookId(bookId: string) {
    return prisma.videoProject.findMany({
      where: { bookId }, orderBy: { createdAt: 'desc' },
      include: {
        filmBible: { select: { id: true, premise: true, genre: true, tone: true } },
        _count: { select: { scenes: true, characters: true, locations: true } },
      },
    });
  },
  async update(id: string, data: Prisma.VideoProjectUpdateInput) {
    return prisma.videoProject.update({ where: { id }, data });
  },
  async updateStatus(id: string, status: VideoProjectStatus, extra?: Prisma.VideoProjectUpdateInput) {
    return prisma.videoProject.update({ where: { id }, data: { status, ...extra } });
  },
  async incrementCompletedScenes(id: string) {
    return prisma.videoProject.update({ where: { id }, data: { completedScenes: { increment: 1 } } });
  },
};
