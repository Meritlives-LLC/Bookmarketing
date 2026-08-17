import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { videoProjectRepository } from '../repositories/video-project.repository';
import { videoSceneRepository } from '../repositories/video-scene.repository';

const SceneListSchema = z.object({
  scenes: z.array(z.object({
    sceneNumber: z.number(), sourceStart: z.number().int().min(0), sourceEnd: z.number().int().min(0),
    summary: z.string().nullable().optional(), characters: z.array(z.string()).default([]),
    location: z.string().nullable().optional(), props: z.array(z.string()).default([]),
    action: z.string().nullable().optional(), emotionalBeat: z.string().nullable().optional(),
    estimatedDurationSec: z.number().nullable().optional(),
    shots: z.array(z.object({
      shotNumber: z.number(), shotType: z.string().nullable().optional(),
      sourceTextSegment: z.string().nullable().optional(), action: z.string().nullable().optional(),
      camera: z.string().nullable().optional(), lens: z.string().nullable().optional(),
      movement: z.string().nullable().optional(), composition: z.string().nullable().optional(),
      lighting: z.string().nullable().optional(), durationSec: z.number().nullable().optional(),
      startOffsetSec: z.number().nullable().optional(), visualPrompt: z.string().nullable().optional(),
      negativePrompt: z.string().nullable().optional(),
    })).optional(),
  })),
});

function validateCoverage(chapterText: string, proposals: Array<{ sourceStart: number; sourceEnd: number }>) {
  const errors: string[] = [];
  const sorted = [...proposals].sort((a, b) => a.sourceStart - b.sourceStart);
  if (!sorted.length) return { ok: false, errors: ['No scenes'] };
  if (sorted[0].sourceStart > 0) errors.push('Gap at start');
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.sourceEnd <= s.sourceStart) errors.push(`Scene ${i+1}: end <= start`);
    if (s.sourceEnd > chapterText.length) errors.push(`Scene ${i+1}: beyond end`);
    if (i > 0) {
      if (s.sourceStart < sorted[i-1].sourceEnd) errors.push(`Overlap at ${s.sourceStart}`);
      else if (s.sourceStart > sorted[i-1].sourceEnd) errors.push(`Gap at ${s.sourceStart}`);
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.sourceEnd < chapterText.length && chapterText.slice(last.sourceEnd).trim()) errors.push('Gap at end');
  return { ok: errors.length === 0, errors };
}

function buildVisualPrompt(opts: {
  sourceText: string; filmStyle: string;
  characters: Array<{ name: string; physicalAppearance?: string | null; clothing?: string | null; continuityNotes?: string | null }>;
  location?: { name: string; visualDescription?: string | null; environment?: string | null } | null;
  action?: string | null; shotType?: string | null;
}): string {
  const parts = [`${opts.filmStyle} cinematic film still`];
  if (opts.shotType) parts.push(`${opts.shotType} shot`);
  const charDescs = opts.characters.map((c) => {
    const bits = [c.name];
    if (c.physicalAppearance) bits.push(c.physicalAppearance);
    else if (c.continuityNotes) bits.push(c.continuityNotes.slice(0, 120));
    if (c.clothing) bits.push(`wearing ${c.clothing}`);
    return bits.join(', ');
  });
  if (charDescs.length) parts.push(`featuring ${charDescs.join('; ')}`);
  if (opts.location) parts.push(`set in ${opts.location.name}${opts.location.visualDescription ? ', ' + opts.location.visualDescription : opts.location.environment ? ', ' + opts.location.environment : ''}`);
  if (opts.action) parts.push(opts.action);
  const excerpt = opts.sourceText.slice(0, 280).replace(/\s+/g, ' ').trim();
  if (excerpt) parts.push(`narrative moment: "${excerpt}"`);
  parts.push('professional cinematography, naturalistic lighting, high detail, film grain');
  return parts.join('. ');
}

async function callScenePlan(chapterText: string, chapterNumber: number, title: string | null, filmStyle: string, characters: string[], locations: string[]) {
  const apiKey = config.ai.groq.apiKey;
  const fallback = {
    scenes: [{
      sceneNumber: 1, sourceStart: 0, sourceEnd: chapterText.length, summary: null as string | null,
      characters: characters.slice(0, 5), location: locations[0] ?? null, props: [] as string[],
      action: null as string | null, emotionalBeat: null as string | null,
      estimatedDurationSec: Math.max(8, Math.round(chapterText.split(/\s+/).length / 2.5)),
      shots: [{ shotNumber: 1, shotType: 'medium' as string | null, durationSec: Math.max(8, Math.round(chapterText.split(/\s+/).length / 2.5)), startOffsetSec: 0 }],
    }],
  };
  if (!apiKey) return fallback;
  const slice = chapterText.length > 14000 ? chapterText.slice(0, 14000) + '\n\n[...]' : chapterText;
  const res = await fetch(`${config.ai.groq.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.groq.model || 'openai/gpt-oss-120b', temperature: 0.15, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Segment chapter into cinematic scenes+shots. sourceStart/sourceEnd are 0-based offsets covering the ENTIRE chapter with no gaps/overlaps. Do NOT rewrite story. Return JSON.' },
        { role: 'user', content: `Chapter ${chapterNumber}${title ? `: ${title}` : ''}\nStyle: ${filmStyle}\nCharacters: ${characters.join(', ') || 'none'}\nLocations: ${locations.join(', ') || 'none'}\nLength: ${chapterText.length}\n\n${slice}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Scene plan AI failed ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return SceneListSchema.parse(JSON.parse(json.choices?.[0]?.message?.content || '{"scenes":[]}'));
}

export const scenePlannerService = {
  async planProject(videoProjectId: string, chapterId?: string): Promise<void> {
    const project = await videoProjectRepository.findById(videoProjectId);
    if (!project) throw AppError.notFound('Video project not found');
    if (!project.manuscript?.chapters?.length) throw AppError.badRequest('No chapters');
    await videoProjectRepository.updateStatus(videoProjectId, 'PLANNING', { progress: 62, errorMessage: null });
    const characters = project.characters || [];
    const locations = project.locations || [];
    const filmStyle = project.visualStyle.replace(/_/g, ' ').toLowerCase();
    const wpm = project.narrationWordsPerMinute || 150;
    const chapters = chapterId ? project.manuscript.chapters.filter((c) => c.id === chapterId) : project.manuscript.chapters;
    if (!chapterId) await videoSceneRepository.deleteByProject(videoProjectId);
    let totalScenes = 0;
    for (const chapter of chapters) {
      let plan;
      try {
        plan = await callScenePlan(chapter.sourceText, chapter.chapterNumber, chapter.title, filmStyle, characters.map((c) => c.name), locations.map((l) => l.name));
      } catch (error) {
        logger.error('Scene plan failed — single scene fallback', { error: (error as Error).message });
        plan = {
          scenes: [{
            sceneNumber: 1, sourceStart: 0, sourceEnd: chapter.sourceText.length, summary: null,
            characters: characters.map((c) => c.name).slice(0, 5), location: locations[0]?.name ?? null, props: [] as string[],
            action: null, emotionalBeat: null, estimatedDurationSec: Math.max(8, Math.round(chapter.wordCount / (wpm / 60))),
            shots: [{ shotNumber: 1, shotType: 'medium' as string | null, durationSec: Math.max(8, Math.round(chapter.wordCount / (wpm / 60))), startOffsetSec: 0 }],
          }],
        };
      }
      if (!validateCoverage(chapter.sourceText, plan.scenes).ok) {
        plan.scenes = [{
          sceneNumber: 1, sourceStart: 0, sourceEnd: chapter.sourceText.length, summary: null,
          characters: characters.map((c) => c.name).slice(0, 5), location: locations[0]?.name ?? null, props: [],
          action: null, emotionalBeat: null, estimatedDurationSec: Math.max(8, Math.round(chapter.wordCount / (wpm / 60))),
          shots: [{ shotNumber: 1, shotType: 'medium', durationSec: Math.max(8, Math.round(chapter.wordCount / (wpm / 60))), startOffsetSec: 0 }],
        }];
      }
      if (chapterId) await prisma.videoScene.deleteMany({ where: { chapterId: chapter.id, videoProjectId } });
      for (const proposal of plan.scenes) {
        const start = Math.max(0, Math.min(proposal.sourceStart, chapter.sourceText.length));
        const end = Math.max(start, Math.min(proposal.sourceEnd, chapter.sourceText.length));
        const sourceText = chapter.sourceText.slice(start, end);
        if (!sourceText.trim()) continue;
        const matchedChars = characters.filter((c) => proposal.characters.some((n) => n.toLowerCase() === c.name.toLowerCase()));
        const matchedLoc = locations.find((l) => proposal.location && l.name.toLowerCase() === proposal.location.toLowerCase()) ?? null;
        const visualPrompt = buildVisualPrompt({ sourceText, filmStyle, characters: matchedChars, location: matchedLoc, action: proposal.action, shotType: proposal.shots?.[0]?.shotType });
        const wordCount = sourceText.split(/\s+/).filter(Boolean).length;
        const estimatedDurationSec = proposal.estimatedDurationSec ?? Math.max(4, Math.round((wordCount / wpm) * 60));
        const scene = await prisma.videoScene.create({
          data: {
            videoProjectId, chapterId: chapter.id, sceneNumber: proposal.sceneNumber,
            sourceText, narrationText: sourceText, summary: proposal.summary ?? null,
            characters: proposal.characters, location: proposal.location ?? null, props: proposal.props,
            action: proposal.action ?? null, emotionalBeat: proposal.emotionalBeat ?? null,
            visualPrompt, negativePrompt: 'blurry, distorted faces, text overlay, watermark, low quality',
            estimatedDurationSec, sourceStart: start, sourceEnd: end, status: 'PROMPT_READY',
          },
        });
        const shots = proposal.shots?.length ? proposal.shots : [{ shotNumber: 1, shotType: 'medium', durationSec: estimatedDurationSec, startOffsetSec: 0, visualPrompt }];
        for (const shot of shots) {
          await prisma.videoShot.create({
            data: {
              sceneId: scene.id, shotNumber: shot.shotNumber, shotType: shot.shotType ?? null,
              sourceTextSegment: shot.sourceTextSegment ?? null, action: shot.action ?? null,
              camera: shot.camera ?? null, lens: shot.lens ?? null, movement: shot.movement ?? null,
              composition: shot.composition ?? null, lighting: shot.lighting ?? null,
              durationSec: shot.durationSec ?? estimatedDurationSec, startOffsetSec: shot.startOffsetSec ?? 0,
              visualPrompt: shot.visualPrompt ?? visualPrompt, negativePrompt: shot.negativePrompt ?? null, status: 'PROMPT_READY',
            },
          });
        }
        totalScenes += 1;
      }
    }
    await videoProjectRepository.updateStatus(videoProjectId, 'GENERATING_REFERENCES', { progress: 70, totalScenes, completedScenes: 0 });
  },
};
