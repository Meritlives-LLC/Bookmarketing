import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/helpers';
import { videoProjectRepository } from '../repositories/video-project.repository';
import { videoSceneRepository } from '../repositories/video-scene.repository';
import { chunkTextHierarchical, splitDurationIntoShots } from '../utils/text-chunking';
import { reasonCameraPlan, compileShotPrompt } from '../cinematography';
import {
  segmentChapterDeterministic,
  repairCoverageOrFallback,
  assertFullCoverage,
} from '../utils/deterministic-scene-segmentation';
import { buildLocationCulturalClause } from '../cinematography';

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
      // Structured cinematic camera (preferred over free-text)
      cameraMovement: z.string().nullable().optional(),
      cameraSpeed: z.string().nullable().optional(),
      cameraRig: z.string().nullable().optional(),
      cameraAngle: z.string().nullable().optional(),
      framing: z.string().nullable().optional(),
      focalLength: z.union([z.string(), z.number()]).nullable().optional(),
      focusMode: z.string().nullable().optional(),
      depthOfField: z.string().nullable().optional(),
      movementPurpose: z.string().nullable().optional(),
      focusTarget: z.string().nullable().optional(),
    })).optional(),
  })),
});

function validateCoverage(chapterText: string, proposals: Array<{ sourceStart: number; sourceEnd: number }>) {
  return assertFullCoverage(chapterText, proposals);
}

/** Map deterministic scenes into the AI plan shape used downstream. */
function toPlanScenes(
  segs: ReturnType<typeof segmentChapterDeterministic>,
  characters: string[],
  location: string | null
) {
  return segs.map((seg: any) => ({
    sceneNumber: seg.sceneNumber,
    sourceStart: seg.sourceStart,
    sourceEnd: seg.sourceEnd,
    summary: null as string | null,
    characters: characters.slice(0, 5),
    location,
    props: [] as string[],
    action: null as string | null,
    emotionalBeat: null as string | null,
    estimatedDurationSec: seg.estimatedDurationSec,
    shots: seg.shots.map((sh: any) => ({
      shotNumber: sh.shotNumber,
      shotType: sh.shotType,
      sourceTextSegment: sh.sourceTextSegment,
      durationSec: sh.durationSec,
      startOffsetSec: sh.startOffsetSec,
      camera: sh.camera,
      lens: sh.lens,
      movement: sh.movement,
      composition: sh.composition,
      lighting: sh.lighting,
      visualPrompt: null as string | null,
      negativePrompt: null as string | null,
      action: null as string | null,
    })),
  }));
}

function buildVisualPrompt(opts: {
  sourceText: string; filmStyle: string;
  characters: Array<{ name: string; physicalAppearance?: string | null; clothing?: string | null; continuityNotes?: string | null }>;
  location?: {
    name: string; visualDescription?: string | null; environment?: string | null;
    country?: string | null; city?: string | null; region?: string | null; culturalContext?: string | null;
  } | null;
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
  if (opts.location) {
    // Prefer book-grounded country/city/culturalContext when available —
    // falls back to the generic visualDescription/environment only when
    // the analysis pass found no specific geography for this location.
    const culturalClause = buildLocationCulturalClause(opts.location);
    parts.push(
      `set in ${opts.location.name}${
        culturalClause
          ? ', ' + culturalClause
          : opts.location.visualDescription
            ? ', ' + opts.location.visualDescription
            : opts.location.environment
              ? ', ' + opts.location.environment
              : ''
      }`
    );
  }
  if (opts.action) parts.push(opts.action);
  const excerpt = opts.sourceText.slice(0, 280).replace(/\s+/g, ' ').trim();
  if (excerpt) parts.push(`narrative moment: "${excerpt}"`);
  parts.push('professional cinematography, naturalistic lighting, high detail, film grain');
  return parts.join('. ');
}

type ExtractedEvent = {
  summary?: string; sourceExcerpt?: string | null; subject?: string | null; action?: string | null;
  object?: string | null; participants?: string[]; props?: string[]; emotion?: string | null;
  timeHint?: string | null; locationHint?: string | null;
};

async function callScenePlan(chapterText: string, chapterNumber: number, title: string | null, filmStyle: string, characters: string[], locations: string[], events: ExtractedEvent[]) {
  const apiKey = config.ai.groq.apiKey;
  if (!apiKey) {
    // Offline: full hierarchical deterministic segmentation (100% coverage)
    const segs = segmentChapterDeterministic(chapterText, { targetWordsPerScene: 350, wpm: 150 });
    return {
      scenes: toPlanScenes(segs, characters, locations[0] ?? null),
    };
  }
  // Hierarchical: plan each chunk, then merge scene proposals with absolute offsets
  const chunks = chunkTextHierarchical(chapterText, 10000);
  const allScenes: z.infer<typeof SceneListSchema>['scenes'] = [];
  let sceneCounter = 0;
  for (const chunk of chunks) {
    const res = await fetch(`${config.ai.groq.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ai.groq.model || 'openai/gpt-oss-120b', temperature: 0.15, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Segment this text into cinematic scenes+shots. sourceStart/sourceEnd are 0-based offsets RELATIVE TO THIS CHUNK covering the ENTIRE chunk with no gaps/overlaps. Do NOT rewrite story or invent an event. Every scene MUST contain a concise action that is directly supported by its exact source range; reuse the source verbs/objects where possible. Only list characters, locations, objects, relationships and emotional beats supported by that range or its immediate textual context. For each shot include structured camera fields: cameraMovement (STATIC|PUSH_IN|PULL_OUT|TRACKING|FOLLOW|PAN_LEFT|PAN_RIGHT|DOLLY_IN|HANDHELD|CRANE_UP|...), cameraSpeed (VERY_SLOW|SLOW|MEDIUM|FAST|VERY_FAST), cameraRig, cameraAngle, framing, focalLength, focusMode, depthOfField, movementPurpose. Prefer STATIC when motion is not motivated. Consider continuity between consecutive shots. Return JSON {scenes:[...]}.' },
          { role: 'user', content: `Chapter ${chapterNumber}${title ? `: ${title}` : ''} chunk ${chunk.index + 1}/${chunks.length}\nStyle: ${filmStyle}\nCharacters: ${characters.join(', ') || 'none'}\nLocations: ${locations.join(', ') || 'none'}\nBook-extracted event evidence (use only where its excerpt overlaps this chunk; the chunk text remains authoritative): ${JSON.stringify(events)}\nChunk length: ${chunk.text.length}\n\n${chunk.text}` },
        ],
      }),
      signal: AbortSignal.timeout(config.ai.groq.timeoutMs),
    });
    if (!res.ok) throw new Error(`Scene plan AI failed ${res.status} on chunk ${chunk.index}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = SceneListSchema.parse(JSON.parse(json.choices?.[0]?.message?.content || '{"scenes":[]}'));
    for (const s of parsed.scenes) {
      sceneCounter += 1;
      allScenes.push({
        ...s,
        sceneNumber: sceneCounter,
        sourceStart: chunk.start + s.sourceStart,
        sourceEnd: chunk.start + s.sourceEnd,
      });
    }
  }
  return { scenes: allScenes };
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
    const bibleAnalysis = Array.isArray((project.filmBible?.rawAnalysis as unknown))
      ? (project.filmBible?.rawAnalysis as Array<{ chapterNumber?: number; events?: ExtractedEvent[] }>)
      : [];
    const chapters = chapterId ? project.manuscript.chapters.filter((c) => c.id === chapterId) : project.manuscript.chapters;
    if (!chapterId) await videoSceneRepository.deleteByProject(videoProjectId);
    let totalScenes = 0;
    for (const chapter of chapters) {
      let plan;
      try {
        const chapterEvents = bibleAnalysis.find((analysis) => analysis.chapterNumber === chapter.chapterNumber)?.events ?? [];
        plan = await callScenePlan(chapter.sourceText, chapter.chapterNumber, chapter.title, filmStyle, characters.map((c) => c.name), locations.map((l) => l.name), chapterEvents);
      } catch (error) {
        logger.error('Scene plan failed — deterministic segmentation fallback', { error: (error as Error).message });
        const segs = segmentChapterDeterministic(chapter.sourceText, { targetWordsPerScene: 350, wpm });
        plan = {
          scenes: toPlanScenes(segs, characters.map((c) => c.name), locations[0]?.name ?? null),
        };
      }
      if (!validateCoverage(chapter.sourceText, plan.scenes).ok) {
        // Repair AI ranges if possible; otherwise full deterministic hierarchy
        logger.warn('AI scene coverage invalid — applying deterministic segmentation', {
          chapterNumber: chapter.chapterNumber,
          ...validateCoverage(chapter.sourceText, plan.scenes),
        });
        const repaired = repairCoverageOrFallback(
          chapter.sourceText,
          plan.scenes,
          { targetWordsPerScene: 350, wpm }
        );
        // If repair still fails coverage, force pure deterministic
        const finalSegs = assertFullCoverage(chapter.sourceText, repaired).ok
          ? repaired
          : segmentChapterDeterministic(chapter.sourceText, { targetWordsPerScene: 350, wpm });
        plan.scenes = toPlanScenes(
          finalSegs,
          characters.map((c) => c.name),
          locations[0]?.name ?? null
        );
      }
      if (chapterId) await prisma.videoScene.deleteMany({ where: { chapterId: chapter.id, videoProjectId } });
      for (const proposal of plan.scenes) {
        const start = Math.max(0, Math.min(proposal.sourceStart, chapter.sourceText.length));
        const end = Math.max(start, Math.min(proposal.sourceEnd, chapter.sourceText.length));
        const sourceText = chapter.sourceText.slice(start, end);
        if (!sourceText.trim()) continue;
        // Keep an action even in offline/fallback plans: the exact source
        // sentence is evidence, not a fabricated paraphrase. The validator
        // later rejects an AI-proposed action that does not match this range.
        const groundedAction = proposal.action?.trim() || sourceText.split(/(?<=[.!?])\s+/)[0].slice(0, 400);
        const matchedChars = characters.filter((c) => proposal.characters.some((n: string) => n.toLowerCase() === c.name.toLowerCase() || (c.aliases || []).some((alias) => alias.toLowerCase() === n.toLowerCase())));
        const matchedLoc = locations.find((l) => proposal.location && l.name.toLowerCase() === proposal.location.toLowerCase()) ?? null;
        const visualPrompt = buildVisualPrompt({ sourceText, filmStyle, characters: matchedChars, location: matchedLoc, action: groundedAction, shotType: proposal.shots?.[0]?.shotType });
        const wordCount = sourceText.split(/\s+/).filter(Boolean).length;
        const estimatedDurationSec = proposal.estimatedDurationSec ?? Math.max(4, Math.round((wordCount / wpm) * 60));
        const scene = await prisma.videoScene.create({
          data: {
            videoProjectId, chapterId: chapter.id, sceneNumber: proposal.sceneNumber,
            sourceText, narrationText: sourceText, summary: proposal.summary ?? null,
            characters: proposal.characters, location: proposal.location ?? null, props: proposal.props,
            action: groundedAction, emotionalBeat: proposal.emotionalBeat ?? null,
            visualPrompt, negativePrompt: 'blurry, distorted faces, text overlay, watermark, low quality',
            estimatedDurationSec, sourceStart: start, sourceEnd: end, status: 'PROMPT_READY',
          },
        });
        // Ensure shot durations respect provider max (~8s); split oversize shots
        let rawShots = proposal.shots?.length
          ? proposal.shots
          : [{ shotNumber: 1, shotType: 'medium', durationSec: estimatedDurationSec, startOffsetSec: 0, visualPrompt }];
        const expanded: Array<Record<string, any>> = [];
        let globalOff = 0;
        let shotNum = 1;
        for (const rs of rawShots) {
          const durs = splitDurationIntoShots(rs.durationSec ?? estimatedDurationSec, 8, 2);
          const seg = (rs as any).sourceTextSegment || sourceText;
          for (const d of durs) {
            expanded.push({
              ...rs,
              shotNumber: shotNum++,
              durationSec: d,
              startOffsetSec: globalOff,
              sourceTextSegment: seg,
              visualPrompt: (rs as any).visualPrompt ?? visualPrompt,
            });
            globalOff += d;
          }
        }
        const totalShots = expanded.length;
        for (let si = 0; si < expanded.length; si++) {
          const shot = expanded[si];
          // Prefer AI structured camera when present; otherwise reason from narrative context
          let camPlan = reasonCameraPlan({
            shotNumber: shot.shotNumber ?? si + 1,
            totalShotsInScene: totalShots,
            shotType: shot.shotType,
            action: shot.action ?? groundedAction,
            emotionalBeat: proposal.emotionalBeat,
            locationKind: 'unknown',
            locationScale: 'unknown',
            intensity: 'medium',
            previous: si > 0 ? undefined : undefined,
          });
          const aiMove = (shot as any).cameraMovement;
          if (aiMove) {
            camPlan = {
              ...camPlan,
              cameraMovement: aiMove as any,
              cameraSpeed: ((shot as any).cameraSpeed || camPlan.cameraSpeed) as any,
              cameraRig: ((shot as any).cameraRig || camPlan.cameraRig) as any,
              cameraAngle: ((shot as any).cameraAngle || camPlan.cameraAngle) as any,
              framing: ((shot as any).framing || camPlan.framing) as any,
              lens: String((shot as any).focalLength || (shot as any).lens || camPlan.lens),
              focalLength: String((shot as any).focalLength || (shot as any).lens || camPlan.focalLength),
              focusMode: ((shot as any).focusMode || camPlan.focusMode) as any,
              depthOfField: ((shot as any).depthOfField || camPlan.depthOfField) as any,
              movementPurpose: ((shot as any).movementPurpose || camPlan.movementPurpose) as any,
              cameraSummary: `${(shot as any).cameraRig || camPlan.cameraRig} ${aiMove}`.toLowerCase().replace(/_/g, ' '),
              movementSummary: `${aiMove} @ ${(shot as any).cameraSpeed || camPlan.cameraSpeed}`,
            };
          }
          const compiled = compileShotPrompt({
            baseVisual: shot.visualPrompt ?? visualPrompt ?? sourceText.slice(0, 400),
            camera: camPlan,
            filmStyle,
            negativePrompt: shot.negativePrompt ?? null,
          });
          await prisma.videoShot.create({
            data: {
              sceneId: scene.id,
              shotNumber: shot.shotNumber,
              shotType: shot.shotType ?? camPlan.framing,
              sourceTextSegment: shot.sourceTextSegment ?? sourceText,
              action: shot.action ?? null,
              camera: camPlan.cameraSummary,
              movement: camPlan.movementSummary,
              lens: camPlan.lens,
              focalLength: camPlan.focalLength,
              cameraMovement: camPlan.cameraMovement,
              cameraSpeed: camPlan.cameraSpeed,
              cameraDirection: (shot as any).cameraDirection ?? null,
              cameraAngle: camPlan.cameraAngle,
              cameraRig: camPlan.cameraRig,
              framing: camPlan.framing,
              focusMode: camPlan.focusMode,
              depthOfField: camPlan.depthOfField,
              movementPurpose: camPlan.movementPurpose,
              focusTarget: (shot as any).focusTarget ?? null,
              composition: camPlan.composition,
              lighting: (shot as any).lighting ?? null,
              durationSec: shot.durationSec ?? estimatedDurationSec,
              startOffsetSec: shot.startOffsetSec ?? 0,
              visualPrompt: compiled.prompt,
              negativePrompt: compiled.negativePrompt,
              status: 'PROMPT_READY',
            },
          });
        }
        totalScenes += 1;
      }
    }
    await videoProjectRepository.updateStatus(videoProjectId, 'GENERATING_REFERENCES', { progress: 70, totalScenes, completedScenes: 0 });
  },
};
