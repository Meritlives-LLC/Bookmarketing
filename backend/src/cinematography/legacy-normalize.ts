/**
 * Backward compatibility: map legacy VideoShot.camera / movement / lens
 * into structured camera parameters without requiring project recreation.
 */
import type {
  ShotCameraPlan, CameraMovement, CameraSpeed, CameraRig, CameraAngle,
  CameraFraming, FocusMode, DepthOfField, MovementPurpose,
} from './camera-types';

export interface LegacyShotFields {
  camera?: string | null;
  movement?: string | null;
  lens?: string | null;
  composition?: string | null;
  lighting?: string | null;
  shotType?: string | null;
  cameraMovement?: string | null;
  cameraSpeed?: string | null;
  cameraAngle?: string | null;
  cameraRig?: string | null;
  framing?: string | null;
  focalLength?: string | null;
  focusMode?: string | null;
  depthOfField?: string | null;
  movementPurpose?: string | null;
  focusTarget?: string | null;
  cameraDirection?: string | null;
}

const MOVE_ALIASES: Record<string, CameraMovement> = {
  static: 'STATIC', pan: 'PAN_RIGHT', 'pan left': 'PAN_LEFT', 'pan right': 'PAN_RIGHT',
  'tilt up': 'TILT_UP', 'tilt down': 'TILT_DOWN', dolly: 'DOLLY_IN', 'dolly in': 'DOLLY_IN',
  'dolly out': 'DOLLY_OUT', 'push in': 'PUSH_IN', 'pull out': 'PULL_OUT', tracking: 'TRACKING',
  follow: 'FOLLOW', orbit: 'ORBIT', arc: 'ARC', crane: 'CRANE_UP', handheld: 'HANDHELD',
  steadicam: 'STEADICAM', gimbal: 'GIMBAL', zoom: 'ZOOM_IN', 'whip pan': 'WHIP_PAN',
  drone: 'DRONE_FORWARD', pov: 'POV',
};

const FRAMING_ALIASES: Record<string, CameraFraming> = {
  'extreme wide': 'EXTREME_WIDE', wide: 'WIDE', full: 'FULL', 'medium wide': 'MEDIUM_WIDE',
  medium: 'MEDIUM', 'medium close-up': 'MEDIUM_CLOSE_UP', 'medium close up': 'MEDIUM_CLOSE_UP',
  'close-up': 'CLOSE_UP', 'close up': 'CLOSE_UP', 'extreme close-up': 'EXTREME_CLOSE_UP',
  ots: 'OVER_SHOULDER', 'over shoulder': 'OVER_SHOULDER', insert: 'INSERT',
};

function pickMove(text: string): CameraMovement | null {
  const l = text.toLowerCase();
  for (const [k, v] of Object.entries(MOVE_ALIASES)) {
    if (l.includes(k)) return v;
  }
  return null;
}

function pickFraming(text: string): CameraFraming | null {
  const l = text.toLowerCase();
  for (const [k, v] of Object.entries(FRAMING_ALIASES)) {
    if (l.includes(k)) return v;
  }
  return null;
}

function pickSpeed(text: string): CameraSpeed {
  const l = text.toLowerCase();
  if (l.includes('very slow') || l.includes('very_slow')) return 'VERY_SLOW';
  if (l.includes('very fast') || l.includes('very_fast')) return 'VERY_FAST';
  if (l.includes('fast')) return 'FAST';
  if (l.includes('medium')) return 'MEDIUM';
  if (l.includes('slow')) return 'SLOW';
  return 'SLOW';
}

function pickRig(text: string): CameraRig {
  const l = text.toLowerCase();
  if (l.includes('drone')) return 'DRONE';
  if (l.includes('crane') || l.includes('jib')) return 'CRANE';
  if (l.includes('dolly')) return 'DOLLY';
  if (l.includes('steadicam')) return 'STEADICAM';
  if (l.includes('gimbal')) return 'GIMBAL';
  if (l.includes('handheld') || l.includes('shoulder')) return 'HANDHELD';
  if (l.includes('pov')) return 'POV';
  if (l.includes('tripod') || l.includes('static')) return 'STATIC_TRIPOD';
  return 'UNKNOWN';
}

/**
 * Prefer structured fields; fill gaps from legacy free-text.
 */
export function normalizeShotCamera(shot: LegacyShotFields): ShotCameraPlan {
  const blob = [shot.camera, shot.movement, shot.shotType, shot.composition].filter(Boolean).join(' ');

  const movement = (shot.cameraMovement as CameraMovement)
    || pickMove(blob)
    || 'STATIC';
  const speed = (shot.cameraSpeed as CameraSpeed) || pickSpeed(blob);
  const rig = (shot.cameraRig as CameraRig) || pickRig(blob);
  const framing = (shot.framing as CameraFraming)
    || pickFraming(blob)
    || (shot.shotType ? pickFraming(shot.shotType) : null)
    || 'MEDIUM';
  const focal = shot.focalLength || shot.lens || '50mm';
  const lens = shot.lens || focal;

  return {
    cameraMovement: movement,
    cameraSpeed: speed,
    cameraDirection: shot.cameraDirection || null,
    cameraAngle: (shot.cameraAngle as CameraAngle) || 'EYE_LEVEL',
    cameraRig: rig,
    lens,
    focalLength: focal,
    framing,
    composition: shot.composition || 'rule-of-thirds',
    focusMode: (shot.focusMode as FocusMode) || 'FIXED',
    depthOfField: (shot.depthOfField as DepthOfField) || 'MEDIUM',
    movementPurpose: (shot.movementPurpose as MovementPurpose) || 'FOLLOW_CHARACTER',
    cameraSummary: shot.camera || `${rig} ${movement}`.toLowerCase().replace(/_/g, ' '),
    movementSummary: shot.movement || `${movement} @ ${speed}`,
  };
}
