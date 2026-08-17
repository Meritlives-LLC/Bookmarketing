/**
 * Structured camera plan → natural cinematic prompt language (never raw JSON).
 */
import type { ShotCameraPlan } from './camera-types';
import { assertValidOrAdjust, validateCameraPlan } from './camera-validation';

export interface CompileShotPromptInput {
  baseVisual: string;
  camera: ShotCameraPlan;
  negativePrompt?: string | null;
  filmStyle?: string | null;
  continuityNotes?: string[];
  locationKind?: 'interior' | 'exterior' | 'unknown';
  locationScale?: 'small' | 'medium' | 'large' | 'vast' | 'unknown';
  provider?: 'GEMINI_VEO' | 'GENERIC';
}

export interface CompiledShotPrompt {
  prompt: string;
  negativePrompt: string;
  camera: ShotCameraPlan;
  warnings: string[];
}

const MOVEMENT_PHRASES: Record<string, string> = {
  STATIC: 'locked-off static camera, no movement',
  PAN_LEFT: 'pan left', PAN_RIGHT: 'pan right', TILT_UP: 'tilt up', TILT_DOWN: 'tilt down',
  DOLLY_IN: 'dolly in toward subject', DOLLY_OUT: 'dolly out away from subject',
  PUSH_IN: 'gradual push-in toward subject', PULL_OUT: 'gradual pull-out revealing more of the frame',
  TRACKING: 'smooth tracking shot following the subject', FOLLOW: 'following the subject through the space',
  ORBIT: 'orbital move around the subject', ARC: 'arcing camera move around the subject',
  CRANE_UP: 'crane up rising above the scene', CRANE_DOWN: 'crane down descending into the scene',
  BOOM_UP: 'boom up', BOOM_DOWN: 'boom down',
  HANDHELD: 'handheld camera with natural micro-motion', STEADICAM: 'fluid steadicam move', GIMBAL: 'smooth gimbal-stabilized move',
  ZOOM_IN: 'optical zoom in', ZOOM_OUT: 'optical zoom out', WHIP_PAN: 'rapid whip pan',
  DRONE_RISE: 'aerial drone rising', DRONE_DESCEND: 'aerial drone descending',
  DRONE_FORWARD: 'aerial drone flying forward', DRONE_BACKWARD: 'aerial drone flying backward',
  DOLLY_ZOOM: 'dolly zoom (vertigo effect)', POV: 'point-of-view as seen by the character',
  FIRST_PERSON: 'first-person perspective', CUSTOM: 'custom camera move',
};

const SPEED_PHRASES: Record<string, string> = {
  VERY_SLOW: 'very slow', SLOW: 'slow', MEDIUM: 'moderate pace', FAST: 'brisk', VERY_FAST: 'very fast',
};

const ANGLE_PHRASES: Record<string, string> = {
  EYE_LEVEL: 'eye-level angle', LOW_ANGLE: 'low angle looking up', HIGH_ANGLE: 'high angle looking down',
  BIRDS_EYE: "bird's-eye view", WORMS_EYE: "worm's-eye view", DUTCH_ANGLE: 'dutch angle tilted frame',
  OVERHEAD: 'overhead top-down angle', GROUND_LEVEL: 'ground-level angle',
};

const FRAMING_PHRASES: Record<string, string> = {
  EXTREME_WIDE: 'extreme wide shot', WIDE: 'wide shot', FULL: 'full shot', MEDIUM_WIDE: 'medium wide shot',
  MEDIUM: 'medium shot', MEDIUM_CLOSE_UP: 'medium close-up', CLOSE_UP: 'close-up', EXTREME_CLOSE_UP: 'extreme close-up',
  TWO_SHOT: 'two-shot', OVER_SHOULDER: 'over-the-shoulder shot', INSERT: 'insert detail shot',
  CUTAWAY: 'cutaway', POV_FRAME: 'POV framing',
};

const PURPOSE_PHRASES: Record<string, string> = {
  ESTABLISH_LOCATION: 'establishing the location', FOLLOW_CHARACTER: 'following the character',
  FOLLOW_ACTION: 'following the action', BUILD_TENSION: 'building tension',
  CREATE_INTIMACY: 'creating intimacy', CREATE_DISTANCE: 'creating emotional distance',
  SHOW_SCALE: 'showing scale', REVEAL_INFORMATION: 'revealing information',
  REVEAL_CHARACTER: 'revealing the character', REVEAL_OBJECT: 'revealing an object',
  EMPHASIZE_EMOTION: 'emphasizing emotion', CREATE_DISORIENTATION: 'creating disorientation', TRANSITION: 'serving as a transition',
};

const RIG_PHRASES: Record<string, string> = {
  STATIC_TRIPOD: 'tripod-locked', HANDHELD: 'handheld', STEADICAM: 'steadicam', GIMBAL: 'gimbal-stabilized',
  DOLLY: 'dolly-mounted', CRANE: 'crane-mounted', JIB: 'jib-mounted', DRONE: 'drone-mounted',
  SHOULDER: 'shoulder-mounted', POV: 'body-mounted POV', UNKNOWN: '',
};

function compileCameraSentence(camera: ShotCameraPlan): string {
  const framing = FRAMING_PHRASES[camera.framing] || camera.framing;
  const move = MOVEMENT_PHRASES[camera.cameraMovement] || camera.cameraMovement.toLowerCase().replace(/_/g, ' ');
  const speed = SPEED_PHRASES[camera.cameraSpeed] || 'slow';
  const angle = ANGLE_PHRASES[camera.cameraAngle] || 'eye-level';
  const purpose = PURPOSE_PHRASES[camera.movementPurpose] || '';
  const rig = RIG_PHRASES[camera.cameraRig] || '';
  const focal = camera.focalLength || camera.lens || '50mm';
  const dof = camera.depthOfField === 'SHALLOW' ? 'shallow depth of field'
    : camera.depthOfField === 'DEEP' ? 'deep focus' : 'natural depth of field';

  const moveClause = camera.cameraMovement === 'STATIC' ? move : `${speed} ${move}`;
  return [
    framing, `${focal} lens`, angle, moveClause,
    rig ? `${rig} camera` : null, dof, camera.composition || null,
    purpose ? `motivated by ${purpose}` : null,
  ].filter(Boolean).join(', ');
}

export function compileShotPrompt(input: CompileShotPromptInput): CompiledShotPrompt {
  const validation = validateCameraPlan(input.camera, {
    locationKind: input.locationKind,
    locationScale: input.locationScale,
  });
  const camera = assertValidOrAdjust(input.camera, {
    locationKind: input.locationKind,
    locationScale: input.locationScale,
  });

  const style = input.filmStyle ? `${input.filmStyle} cinematic look. ` : '';
  const continuity = input.continuityNotes?.length ? ` Continuity: ${input.continuityNotes.join('; ')}.` : '';
  const prompt = `${style}${input.baseVisual}. Cinematography: ${compileCameraSentence(camera)}.${continuity}`
    .replace(/\s+/g, ' ').trim();

  return {
    prompt,
    negativePrompt: input.negativePrompt || 'blurry, distorted faces, text overlay, watermark, low quality, morphing anatomy',
    camera,
    warnings: validation.warnings || [],
  };
}
