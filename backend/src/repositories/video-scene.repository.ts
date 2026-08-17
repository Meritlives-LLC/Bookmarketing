import { prisma } from '../config/database';
import { VideoSceneStatus, Prisma } from '@prisma/client';

export const videoSceneRepository = {
  async findById(id: string) {
    return prisma.videoScene.findUnique({
      where: { id },
      include: {
        shots: { orderBy: { shotNumber: 'asc' } },
        subtitleCues: { orderBy: { sequence: 'asc' } },
        chapter: true, videoProject: true,
      },
    });
  },
  async findByIdForUser(id: string, userId: string) {
    return prisma.videoScene.findFirst({
      where: { id, videoProject: { book: { userId } } },
      include: {
        shots: { orderBy: { shotNumber: 'asc' } },
        subtitleCues: { orderBy: { sequence: 'asc' } },
        chapter: true, videoProject: true,
      },
    });
  },
  async findByProject(videoProjectId: string) {
    return prisma.videoScene.findMany({
      where: { videoProjectId },
      orderBy: [{ chapterId: 'asc' }, { sceneNumber: 'asc' }],
      include: { shots: { orderBy: { shotNumber: 'asc' } } },
    });
  },
  async update(id: string, data: Prisma.VideoSceneUpdateInput) {
    return prisma.videoScene.update({ where: { id }, data });
  },
  async updateStatus(id: string, status: VideoSceneStatus, extra?: Prisma.VideoSceneUpdateInput) {
    return prisma.videoScene.update({ where: { id }, data: { status, ...extra } });
  },
  async deleteByProject(videoProjectId: string) {
    return prisma.videoScene.deleteMany({ where: { videoProjectId } });
  },
};
