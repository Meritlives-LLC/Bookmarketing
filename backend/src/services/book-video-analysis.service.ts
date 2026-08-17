import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { videoProjectRepository } from '../repositories/video-project.repository';
import { filmBibleRepository } from '../repositories/film-bible.repository';
import { videoCharacterRepository } from '../repositories/video-character.repository';
import { videoLocationRepository } from '../repositories/video-location.repository';
import { chunkTextHierarchical } from '../utils/text-chunking';

const ChapterAnalysisSchema = z.object({
  chapterNumber: z.number().optional(),
  characters: z.array(z.object({
    name: z.string(), aliases: z.array(z.string()).optional(),
    age: z.string().nullable().optional(), appearance: z.string().nullable().optional(),
    clothing: z.string().nullable().optional(), personality: z.string().nullable().optional(),
    role: z.string().nullable().optional(), isFactUnknown: z.boolean().optional(),
  })).default([]),
  locations: z.array(z.object({
    name: z.string(), description: z.string().nullable().optional(),
    architecture: z.string().nullable().optional(), environment: z.string().nullable().optional(),
    timePeriod: z.string().nullable().optional(),
  })).default([]),
  props: z.array(z.object({ name: z.string(), description: z.string().nullable().optional() })).default([]),
  events: z.array(z.object({ summary: z.string(), timeHint: z.string().nullable().optional(), locationHint: z.string().nullable().optional() })).default([]),
  themes: z.array(z.string()).default([]), tone: z.string().nullable().optional(),
});
const FilmBibleSchema = z.object({
  premise: z.string().nullable().optional(), themes: z.array(z.string()).optional(),
  genre: z.string().nullable().optional(), tone: z.string().nullable().optional(),
  visualStyleNotes: z.string().nullable().optional(),
  cinematography: z.record(z.unknown()).nullable().optional(),
  colorLanguage: z.record(z.unknown()).nullable().optional(),
  lighting: z.record(z.unknown()).nullable().optional(),
  cameraLanguage: z.record(z.unknown()).nullable().optional(),
  historicalPeriod: z.string().nullable().optional(),
  geography: z.record(z.unknown()).nullable().optional(),
  worldRules: z.record(z.unknown()).nullable().optional(),
  narrativeRules: z.record(z.unknown()).nullable().optional(),
  characterConsistencyRules: z.record(z.unknown()).nullable().optional(),
  locationConsistencyRules: z.record(z.unknown()).nullable().optional(),
  timeline: z.array(z.unknown()).nullable().optional(),
});

async function callStructuredJson<T>(systemPrompt: string, userPrompt: string, schema: z.ZodType<T>, label: string): Promise<T> {
  const apiKey = config.ai.groq.apiKey;
  if (!apiKey) { logger.warn(`No Groq key — minimal local analysis for ${label}`); return schema.parse({}); }
  const res = await fetch(`${config.ai.groq.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.groq.model || 'openai/gpt-oss-120b', temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${label} failed ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const result = schema.safeParse(JSON.parse(json.choices?.[0]?.message?.content || '{}'));
  if (!result.success) throw new Error(`AI structured output validation failed for ${label}`);
  return result.data;
}

export const bookVideoAnalysisService = {
  async analyzeProject(videoProjectId: string): Promise<void> {
    const project = await videoProjectRepository.findById(videoProjectId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!project.manuscript?.chapters?.length) throw AppError.badRequest('Manuscript has no chapters');
    await videoProjectRepository.updateStatus(videoProjectId, 'ANALYZING', { progress: 5, errorMessage: null });
    const chapters = project.manuscript.chapters;
    const chapterAnalyses: z.infer<typeof ChapterAnalysisSchema>[] = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      // Hierarchical chunking — every character of the chapter is analyzed; nothing discarded.
      const chunks = chunkTextHierarchical(chapter.sourceText, 8000);
      try {
        const partials: z.infer<typeof ChapterAnalysisSchema>[] = [];
        for (const chunk of chunks) {
          const partial = await callStructuredJson(
            'You are a film production analyst. Extract ONLY what appears in this text chunk. Do NOT invent facts. Return JSON with characters, locations, props, events, themes, tone.',
            `Chapter ${chapter.chapterNumber}${chapter.title ? `: ${chapter.title}` : ''} — chunk ${chunk.index + 1}/${chunks.length} (chars ${chunk.start}-${chunk.end} of ${chapter.sourceText.length})\n\n${chunk.text}`,
            ChapterAnalysisSchema,
            `chapter-${chapter.chapterNumber}-chunk-${chunk.index}`
          );
          partials.push(partial);
        }
        // Merge chunk analyses (dedupe by name case-insensitively)
        const mergeByName = <T extends { name: string }>(lists: T[][]): T[] => {
          const map = new Map<string, T>();
          for (const list of lists) {
            for (const item of list) {
              const key = item.name.toLowerCase();
              if (!map.has(key)) map.set(key, item);
            }
          }
          return [...map.values()];
        };
        const analysis: z.infer<typeof ChapterAnalysisSchema> = {
          chapterNumber: chapter.chapterNumber,
          characters: mergeByName(partials.map((p) => p.characters)),
          locations: mergeByName(partials.map((p) => p.locations)),
          props: mergeByName(partials.map((p) => p.props)),
          events: partials.flatMap((p) => p.events),
          themes: [...new Set(partials.flatMap((p) => p.themes))],
          tone: partials.find((p) => p.tone)?.tone ?? null,
        };
        chapterAnalyses.push(analysis);
        for (const c of analysis.characters) {
          await videoCharacterRepository.upsertByName(videoProjectId, c.name, {
            aliases: c.aliases ?? [], age: c.age ?? null, physicalAppearance: c.appearance ?? null,
            clothing: c.clothing ?? null, personality: c.personality ?? null, role: c.role ?? null,
            isFactUnknown: c.isFactUnknown ?? !c.appearance,
          });
        }
        for (const loc of analysis.locations) {
          await videoLocationRepository.upsertByName(videoProjectId, loc.name, {
            description: loc.description ?? null, architecture: loc.architecture ?? null,
            environment: loc.environment ?? null, timePeriod: loc.timePeriod ?? null,
          });
        }
        for (const prop of analysis.props) {
          const existing = await prisma.videoProp.findFirst({ where: { videoProjectId, name: { equals: prop.name, mode: 'insensitive' } } });
          if (existing) await prisma.videoProp.update({ where: { id: existing.id }, data: { description: prop.description ?? null } });
          else await prisma.videoProp.create({ data: { videoProjectId, name: prop.name, description: prop.description ?? null } });
        }
      } catch (error) {
        logger.error('Chapter analysis failed', { chapterNumber: chapter.chapterNumber, error: (error as Error).message });
        chapterAnalyses.push({ chapterNumber: chapter.chapterNumber, characters: [], locations: [], props: [], events: [], themes: [] });
      }
      await videoProjectRepository.update(videoProjectId, { progress: 5 + Math.round(((i + 1) / chapters.length) * 50) });
    }
    const aggregate = chapterAnalyses.map((a) =>
      `Ch ${a.chapterNumber}: chars=[${a.characters.map((c) => c.name).join(', ')}] locs=[${a.locations.map((l) => l.name).join(', ')}] themes=[${a.themes.join(', ')}]`
    ).join('\n');
    let bible: z.infer<typeof FilmBibleSchema> = {};
    try {
      bible = await callStructuredJson('Build a Film Bible from chapter analyses only. Propose cinematic language. Return JSON.', aggregate, FilmBibleSchema, 'film-bible');
    } catch {
      bible = { themes: [...new Set(chapterAnalyses.flatMap((a) => a.themes))], tone: chapterAnalyses.find((a) => a.tone)?.tone ?? null };
    }
    await filmBibleRepository.upsert(videoProjectId, {
      premise: bible.premise ?? null, themes: bible.themes ?? [], genre: bible.genre ?? null, tone: bible.tone ?? null,
      visualStyleNotes: bible.visualStyleNotes ?? null,
      cinematography: (bible.cinematography as object) ?? undefined,
      colorLanguage: (bible.colorLanguage as object) ?? undefined,
      lighting: (bible.lighting as object) ?? undefined,
      cameraLanguage: (bible.cameraLanguage as object) ?? undefined,
      historicalPeriod: bible.historicalPeriod ?? null,
      geography: (bible.geography as object) ?? undefined,
      worldRules: (bible.worldRules as object) ?? undefined,
      narrativeRules: (bible.narrativeRules as object) ?? undefined,
      characterConsistencyRules: (bible.characterConsistencyRules as object) ?? undefined,
      locationConsistencyRules: (bible.locationConsistencyRules as object) ?? undefined,
      timeline: (bible.timeline as object) ?? undefined,
      rawAnalysis: chapterAnalyses as object,
    });
    await videoProjectRepository.updateStatus(videoProjectId, 'PLANNING', { progress: 60, totalChapters: chapters.length });
  },
};
