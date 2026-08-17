/**
 * Shot prompt compiler service — provider-independent.
 * Transforms VideoShot + continuity context into a coherent provider prompt.
 */
import {
  compileShotPrompt,
  normalizeShotCamera,
  validateCameraPlan,
  type ShotCameraPlan,
  type CompileShotPromptInput,
  type CompiledShotPrompt,
} from '../cinematography';

export interface ShotCompileContext {
  sourceTextSegment?: string | null;
  visualPrompt?: string | null;
  negativePrompt?: string | null;
  filmStyle?: string | null;
  characters?: Array<{ name: string; physicalAppearance?: string | null; clothing?: string | null; continuityNotes?: string | null; referenceImageUrl?: string | null }>;
  location?: { name: string; visualDescription?: string | null; environment?: string | null; architecture?: string | null; continuityNotes?: string | null } | null;
  props?: Array<{ name: string; visualDescription?: string | null }>;
  locationKind?: 'interior' | 'exterior' | 'unknown';
  locationScale?: 'small' | 'medium' | 'large' | 'vast' | 'unknown';
  durationSec?: number | null;
  /** Raw shot fields including legacy */
  shot: Parameters<typeof normalizeShotCamera>[0] & {
    durationSec?: number | null;
    focusTarget?: string | null;
  };
}

function cameraAwareNegatives(plan: ShotCameraPlan): string[] {
  const neg: string[] = [
    'blurry', 'distorted faces', 'text overlay', 'watermark', 'low quality',
    'morphing anatomy', 'unwanted cuts', 'jump cuts',
  ];
  if (plan.cameraMovement === 'STATIC') {
    neg.push('camera shake', 'unwanted zoom', 'drifting framing', 'random camera movement');
  }
  if (plan.cameraMovement === 'HANDHELD') {
    neg.push('excessive shake', 'nauseating motion');
  }
  if (['PUSH_IN', 'DOLLY_IN', 'PULL_OUT', 'DOLLY_OUT', 'TRACKING', 'FOLLOW'].includes(plan.cameraMovement)) {
    neg.push('sudden direction reverse', 'jerky motion', 'inconsistent subject position');
  }
  if (plan.depthOfField === 'SHALLOW' || plan.depthOfField === 'EXTREME_SHALLOW') {
    neg.push('everything in focus', 'flat focus');
  }
  if (plan.cameraMovement !== 'ZOOM_IN' && plan.cameraMovement !== 'ZOOM_OUT') {
    neg.push('random zoom');
  }
  return neg;
}

export const shotPromptCompilerService = {
  /**
   * Compile a provider-ready prompt from structured shot + continuity context.
   * Never dumps raw JSON into the prompt.
   */
  compile(ctx: ShotCompileContext): CompiledShotPrompt {
    const plan = normalizeShotCamera(ctx.shot);
    const validation = validateCameraPlan(plan, {
      locationKind: ctx.locationKind,
      locationScale: ctx.locationScale,
    });
    const camera = validation.adjusted && (!validation.ok || validation.warnings.length)
      ? validation.adjusted
      : plan;

    // Short shots: prefer simpler movement language (duration-aware)
    if ((ctx.durationSec || ctx.shot.durationSec || 8) <= 3 && camera.cameraMovement !== 'STATIC') {
      if (['ORBIT', 'ARC', 'CRANE_UP', 'CRANE_DOWN', 'DOLLY_ZOOM'].includes(camera.cameraMovement)) {
        camera.cameraMovement = 'STATIC';
        camera.cameraSpeed = 'SLOW';
        camera.movementSummary = 'STATIC @ SLOW (simplified for short duration)';
      }
    }

    const continuityNotes: string[] = [];
    for (const c of ctx.characters || []) {
      const bits = [c.physicalAppearance, c.clothing, c.continuityNotes].filter(Boolean).join(' ');
      if (bits) continuityNotes.push(`Character ${c.name} appearance locked: ${bits.slice(0, 180)}`);
    }
    if (ctx.location) {
      const bits = [ctx.location.visualDescription, ctx.location.environment, ctx.location.architecture, ctx.location.continuityNotes]
        .filter(Boolean).join(' ');
      if (bits) continuityNotes.push(`Location ${ctx.location.name} locked: ${bits.slice(0, 180)}`);
    }
    for (const p of ctx.props || []) {
      if (p.visualDescription) continuityNotes.push(`Prop ${p.name}: ${p.visualDescription.slice(0, 100)}`);
    }
    if (ctx.shot.focusTarget) {
      continuityNotes.push(`Focus target: ${ctx.shot.focusTarget}`);
    }

    // Base visual = narrative content only (source-faithful). Camera is separate sentence.
    const base =
      (ctx.sourceTextSegment || '').slice(0, 500)
      || (ctx.visualPrompt && !ctx.visualPrompt.includes('Cinematography:')
        ? ctx.visualPrompt.slice(0, 500)
        : 'Cinematic narrative moment');

    const autoNeg = cameraAwareNegatives(camera).join(', ');
    const negative = [ctx.negativePrompt, autoNeg].filter(Boolean).join(', ');

    return compileShotPrompt({
      baseVisual: base,
      camera,
      filmStyle: ctx.filmStyle,
      continuityNotes,
      negativePrompt: negative,
      locationKind: ctx.locationKind,
      locationScale: ctx.locationScale,
      provider: 'GEMINI_VEO',
    });
  },
};
