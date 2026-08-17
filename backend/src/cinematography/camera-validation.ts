import type { ShotCameraPlan, CameraMovement } from './camera-types';

export interface CameraValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  adjusted?: ShotCameraPlan;
}

const DRONE_MOVES: CameraMovement[] = ['DRONE_RISE', 'DRONE_DESCEND', 'DRONE_FORWARD', 'DRONE_BACKWARD'];
const AERIAL_MOVES: CameraMovement[] = [...DRONE_MOVES, 'CRANE_UP', 'CRANE_DOWN', 'BOOM_UP', 'BOOM_DOWN'];

export function validateCameraPlan(
  plan: ShotCameraPlan,
  context?: { locationKind?: 'interior' | 'exterior' | 'unknown'; locationScale?: string }
): CameraValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const adjusted: ShotCameraPlan = { ...plan };

  if (DRONE_MOVES.includes(plan.cameraMovement) && plan.cameraRig !== 'DRONE') {
    warnings.push(`Movement ${plan.cameraMovement} expects DRONE rig`);
    adjusted.cameraRig = 'DRONE';
  }
  if ((plan.cameraMovement === 'CRANE_UP' || plan.cameraMovement === 'CRANE_DOWN') && plan.cameraRig !== 'CRANE' && plan.cameraRig !== 'JIB') {
    warnings.push('Crane movement expects CRANE/JIB rig');
    adjusted.cameraRig = 'CRANE';
  }
  if (plan.cameraMovement === 'HANDHELD' && plan.cameraRig !== 'HANDHELD' && plan.cameraRig !== 'SHOULDER') {
    adjusted.cameraRig = 'HANDHELD';
    warnings.push('HANDHELD movement aligned to HANDHELD rig');
  }
  if ((plan.cameraMovement === 'POV' || plan.cameraMovement === 'FIRST_PERSON') && plan.cameraRig !== 'POV') {
    adjusted.cameraRig = 'POV';
  }
  if (context?.locationKind === 'interior' && context?.locationScale === 'small') {
    if (AERIAL_MOVES.includes(plan.cameraMovement)) {
      errors.push(`${plan.cameraMovement} impractical in small interior`);
      adjusted.cameraMovement = 'STATIC';
      adjusted.cameraRig = 'STATIC_TRIPOD';
      adjusted.cameraAngle = 'EYE_LEVEL';
    }
    if (plan.cameraRig === 'DRONE') {
      errors.push('DRONE rig impractical in small interior');
      adjusted.cameraRig = 'STATIC_TRIPOD';
    }
  }
  if (plan.cameraMovement === 'STATIC' && (plan.cameraSpeed === 'FAST' || plan.cameraSpeed === 'VERY_FAST')) {
    warnings.push('STATIC ignores FAST speed');
    adjusted.cameraSpeed = 'SLOW';
  }
  if (plan.cameraMovement === 'WHIP_PAN' && plan.cameraSpeed === 'VERY_SLOW') {
    warnings.push('WHIP_PAN implies FAST');
    adjusted.cameraSpeed = 'FAST';
  }
  if (plan.framing === 'EXTREME_WIDE' && plan.depthOfField === 'SHALLOW') {
    warnings.push('EXTREME_WIDE prefers DEEP DOF');
    adjusted.depthOfField = 'DEEP';
  }
  return { ok: errors.length === 0, errors, warnings, adjusted };
}

export function assertValidOrAdjust(
  plan: ShotCameraPlan,
  context?: { locationKind?: 'interior' | 'exterior' | 'unknown'; locationScale?: string }
): ShotCameraPlan {
  const result = validateCameraPlan(plan, context);
  if (result.adjusted && (!result.ok || result.warnings.length)) return result.adjusted;
  return plan;
}
