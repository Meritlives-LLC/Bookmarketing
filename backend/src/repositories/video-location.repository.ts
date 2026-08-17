import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const videoLocationRepository = {
  async upsertByName(videoProjectId: string, name: string, data: Prisma.VideoLocationUpdateInput) {
    const existing = await prisma.videoLocation.findFirst({
      where: { videoProjectId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return prisma.videoLocation.update({ where: { id: existing.id }, data });
    return prisma.videoLocation.create({
      data: {
        videoProjectId, name,
        description: data.description as string | undefined,
        architecture: data.architecture as string | undefined,
        environment: data.environment as string | undefined,
        timePeriod: data.timePeriod as string | undefined,
        weatherPatterns: data.weatherPatterns as string | undefined,
        lightingRules: data.lightingRules as string | undefined,
        visualDescription: data.visualDescription as string | undefined,
        continuityNotes: data.continuityNotes as string | undefined,
      },
    });
  },
  async findByProject(videoProjectId: string) {
    return prisma.videoLocation.findMany({ where: { videoProjectId }, orderBy: { name: 'asc' } });
  },
};
