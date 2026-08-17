import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const filmBibleRepository = {
  async upsert(videoProjectId: string, data: Omit<Prisma.FilmBibleCreateInput, 'videoProject'>) {
    return prisma.filmBible.upsert({
      where: { videoProjectId },
      create: { ...data, videoProject: { connect: { id: videoProjectId } } },
      update: data,
    });
  },
  async findByProject(videoProjectId: string) {
    return prisma.filmBible.findUnique({ where: { videoProjectId } });
  },
};
