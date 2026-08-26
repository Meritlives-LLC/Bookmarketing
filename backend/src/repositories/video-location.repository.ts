import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const videoLocationRepository = {
  /**
   * A location can be re-analyzed across multiple chapters. A later chapter
   * chunk that simply doesn't mention (say) the country again must not blank
   * out a value an earlier chunk correctly extracted — that would silently
   * destroy grounding data (country/city/culturalContext) the analysis
   * already established. Only overwrite a field when the new value is a
   * real, non-empty string; null/undefined fields in `data` are skipped so
   * the existing value survives.
   */
  async upsertByName(videoProjectId: string, name: string, data: Prisma.VideoLocationUpdateInput) {
    const existing = await prisma.videoLocation.findFirst({
      where: { videoProjectId, name: { equals: name, mode: 'insensitive' } },
    });
    const mergeable = [
      'description', 'architecture', 'environment', 'timePeriod', 'weatherPatterns',
      'lightingRules', 'visualDescription', 'continuityNotes', 'referenceImageUrl',
      'country', 'city', 'region', 'culturalContext',
    ] as const;
    if (existing) {
      const patch: Record<string, string> = {};
      for (const key of mergeable) {
        const value = data[key as keyof typeof data] as unknown;
        if (typeof value === 'string' && value.trim().length > 0) patch[key] = value;
      }
      if (Object.keys(patch).length === 0) return existing;
      return prisma.videoLocation.update({ where: { id: existing.id }, data: patch });
    }
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
        country: data.country as string | undefined,
        city: data.city as string | undefined,
        region: data.region as string | undefined,
        culturalContext: data.culturalContext as string | undefined,
      },
    });
  },
  async findByProject(videoProjectId: string) {
    return prisma.videoLocation.findMany({ where: { videoProjectId }, orderBy: { name: 'asc' } });
  },
};
