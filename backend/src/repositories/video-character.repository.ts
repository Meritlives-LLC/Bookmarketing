import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const videoCharacterRepository = {
  async upsertByName(videoProjectId: string, name: string, data: Prisma.VideoCharacterUpdateInput) {
    const existing = await prisma.videoCharacter.findFirst({
      where: { videoProjectId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return prisma.videoCharacter.update({ where: { id: existing.id }, data });
    return prisma.videoCharacter.create({
      data: {
        videoProjectId, name,
        aliases: (data.aliases as string[]) ?? [],
        age: data.age as string | undefined,
        gender: data.gender as string | undefined,
        physicalAppearance: data.physicalAppearance as string | undefined,
        clothing: data.clothing as string | undefined,
        personality: data.personality as string | undefined,
        role: data.role as string | undefined,
        isFactUnknown: (data.isFactUnknown as boolean) ?? false,
      },
    });
  },
  async findByProject(videoProjectId: string) {
    return prisma.videoCharacter.findMany({ where: { videoProjectId }, orderBy: { name: 'asc' } });
  },
};
