/**
 * Intentional camera selection from narrative context.
 * Static is first-class — avoid random motion.
 */
import type {
  ShotCameraPlan, ShotCameraContext, CameraMovement, CameraSpeed, CameraRig,
  CameraAngle, CameraFraming, FocusMode, DepthOfField, MovementPurpose,
} from './camera-types';

function purposeFromContext(ctx: ShotCameraContext): MovementPurpose {
  const beat = (ctx.emotionalBeat || '').toLowerCase();
  const action = (ctx.action || '').toLowerCase();
  const isFirst = ctx.shotNumber === 1;
  const isLast = ctx.shotNumber === ctx.totalShotsInScene;
  if (isFirst) return 'ESTABLISH_LOCATION';
  if (isLast && (beat.includes('reveal') || action.includes('reveal'))) return 'REVEAL_INFORMATION';
  if (beat.includes('tension') || beat.includes('fear') || beat.includes('dread')) return 'BUILD_TENSION';
  if (beat.includes('intimate') || beat.includes('tender') || beat.includes('love')) return 'CREATE_INTIMACY';
  if (beat.includes('alone') || beat.includes('isolated')) return 'CREATE_DISTANCE';
  if (beat.includes('chaos') || beat.includes('disorient')) return 'CREATE_DISORIENTATION';
  if (action.includes('run') || action.includes('chase') || action.includes('fight')) return 'FOLLOW_ACTION';
  if (action.includes('walk') || action.includes('follow')) return 'FOLLOW_CHARACTER';
  if ((ctx.locationScale === 'vast' || ctx.locationScale === 'large') && (isFirst || isLast)) return 'SHOW_SCALE';
  if (beat.includes('grief') || beat.includes('anger') || beat.includes('emotion')) return 'EMPHASIZE_EMOTION';
  return isLast ? 'EMPHASIZE_EMOTION' : 'FOLLOW_CHARACTER';
}

function framingForPurpose(purpose: MovementPurpose, ctx: ShotCameraContext): CameraFraming {
  switch (purpose) {
    case 'ESTABLISH_LOCATION':
    case 'SHOW_SCALE':
      return ctx.locationScale === 'vast' ? 'EXTREME_WIDE' : 'WIDE';
    case 'CREATE_INTIMACY':
    case 'EMPHASIZE_EMOTION':
      return 'CLOSE_UP';
    case 'REVEAL_OBJECT': return 'INSERT';
    case 'REVEAL_CHARACTER': return 'MEDIUM_CLOSE_UP';
    case 'FOLLOW_ACTION': return 'MEDIUM_WIDE';
    case 'FOLLOW_CHARACTER': return 'MEDIUM';
    case 'CREATE_DISORIENTATION': return 'MEDIUM';
    default: return ctx.shotNumber === 1 ? 'WIDE' : 'MEDIUM';
  }
}

function movementForPurpose(purpose: MovementPurpose, framing: CameraFraming, ctx: ShotCameraContext) {
  switch (purpose) {
    case 'ESTABLISH_LOCATION':
      if (ctx.locationKind === 'exterior' && (ctx.locationScale === 'large' || ctx.locationScale === 'vast')) {
        return { movement: 'DRONE_FORWARD' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'DRONE' as CameraRig, angle: 'HIGH_ANGLE' as CameraAngle };
      }
      return { movement: 'STATIC' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'STATIC_TRIPOD' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    case 'SHOW_SCALE':
      if (ctx.locationKind === 'interior' && ctx.locationScale === 'small') {
        return { movement: 'PULL_OUT' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'DOLLY' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
      }
      return { movement: 'CRANE_UP' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'CRANE' as CameraRig, angle: 'HIGH_ANGLE' as CameraAngle };
    case 'BUILD_TENSION':
      return { movement: 'PUSH_IN' as CameraMovement, speed: 'VERY_SLOW' as CameraSpeed, rig: 'DOLLY' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    case 'CREATE_INTIMACY':
    case 'EMPHASIZE_EMOTION':
      return {
        movement: (framing === 'CLOSE_UP' || framing === 'EXTREME_CLOSE_UP' ? 'STATIC' : 'PUSH_IN') as CameraMovement,
        speed: 'VERY_SLOW' as CameraSpeed, rig: 'STATIC_TRIPOD' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle,
      };
    case 'CREATE_DISTANCE':
      return { movement: 'PULL_OUT' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'DOLLY' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    case 'FOLLOW_CHARACTER':
      return { movement: 'TRACKING' as CameraMovement, speed: 'MEDIUM' as CameraSpeed, rig: 'STEADICAM' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    case 'FOLLOW_ACTION':
      return {
        movement: (ctx.intensity === 'high' ? 'HANDHELD' : 'FOLLOW') as CameraMovement,
        speed: (ctx.intensity === 'high' ? 'FAST' : 'MEDIUM') as CameraSpeed,
        rig: (ctx.intensity === 'high' ? 'HANDHELD' : 'GIMBAL') as CameraRig,
        angle: 'EYE_LEVEL' as CameraAngle,
      };
    case 'REVEAL_INFORMATION':
    case 'REVEAL_CHARACTER':
      return { movement: 'PUSH_IN' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'DOLLY' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    case 'REVEAL_OBJECT':
      return { movement: 'STATIC' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'STATIC_TRIPOD' as CameraRig, angle: 'HIGH_ANGLE' as CameraAngle };
    case 'CREATE_DISORIENTATION':
      return { movement: 'HANDHELD' as CameraMovement, speed: 'MEDIUM' as CameraSpeed, rig: 'HANDHELD' as CameraRig, angle: 'DUTCH_ANGLE' as CameraAngle };
    case 'TRANSITION':
      return { movement: 'PAN_RIGHT' as CameraMovement, speed: 'MEDIUM' as CameraSpeed, rig: 'STATIC_TRIPOD' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
    default:
      return { movement: 'STATIC' as CameraMovement, speed: 'SLOW' as CameraSpeed, rig: 'STATIC_TRIPOD' as CameraRig, angle: 'EYE_LEVEL' as CameraAngle };
  }
}

function lensForFraming(framing: CameraFraming) {
  switch (framing) {
    case 'EXTREME_WIDE':
    case 'WIDE': return { lens: '24mm', focalLength: '24mm', dof: 'DEEP' as DepthOfField, focus: 'DEEP_FOCUS' as FocusMode };
    case 'FULL':
    case 'MEDIUM_WIDE': return { lens: '35mm', focalLength: '35mm', dof: 'DEEP' as DepthOfField, focus: 'FIXED' as FocusMode };
    case 'MEDIUM':
    case 'TWO_SHOT':
    case 'OVER_SHOULDER': return { lens: '50mm', focalLength: '50mm', dof: 'MEDIUM' as DepthOfField, focus: 'FIXED' as FocusMode };
    case 'MEDIUM_CLOSE_UP': return { lens: '50mm', focalLength: '50mm', dof: 'SHALLOW' as DepthOfField, focus: 'FIXED' as FocusMode };
    case 'CLOSE_UP': return { lens: '85mm', focalLength: '85mm', dof: 'SHALLOW' as DepthOfField, focus: 'FIXED' as FocusMode };
    case 'EXTREME_CLOSE_UP':
    case 'INSERT': return { lens: '100mm', focalLength: '100mm', dof: 'SHALLOW' as DepthOfField, focus: 'FIXED' as FocusMode };
    case 'POV_FRAME': return { lens: '35mm', focalLength: '35mm', dof: 'MEDIUM' as DepthOfField, focus: 'FOLLOW_FOCUS' as FocusMode };
    default: return { lens: '50mm', focalLength: '50mm', dof: 'MEDIUM' as DepthOfField, focus: 'FIXED' as FocusMode };
  }
}

function compositionFor(framing: CameraFraming, angle: CameraAngle): string {
  if (framing === 'CLOSE_UP' || framing === 'EXTREME_CLOSE_UP') return 'tight subject framing, eyes on upper third';
  if (framing === 'EXTREME_WIDE' || framing === 'WIDE') return 'environmental wide, horizon stable';
  if (angle === 'DUTCH_ANGLE') return 'tilted horizon for unease';
  if (framing === 'OVER_SHOULDER') return 'over-shoulder dialogue framing';
  return 'rule-of-thirds, balanced negative space';
}

export function reasonCameraPlan(ctx: ShotCameraContext): ShotCameraPlan {
  const purpose = purposeFromContext(ctx);
  let framing = framingForPurpose(purpose, ctx);
  if (ctx.previous?.framing === 'EXTREME_WIDE' && framing === 'EXTREME_CLOSE_UP' && ctx.shotNumber > 2) {
    framing = 'MEDIUM_CLOSE_UP';
  }
  const movementPlan = movementForPurpose(purpose, framing, ctx);
  const { speed, rig, angle } = movementPlan;
  let { movement } = movementPlan;

  // Continuity: avoid immediate reverse moves
  const prev = ctx.previous?.cameraMovement;
  if ((prev === 'PUSH_IN' && movement === 'PULL_OUT') || (prev === 'PULL_OUT' && movement === 'PUSH_IN') || (prev === 'PAN_LEFT' && movement === 'PAN_RIGHT')) {
    movement = 'STATIC';
  }

  // Small interiors: no aerial
  if (ctx.locationKind === 'interior' && ctx.locationScale === 'small') {
    if (movement.startsWith('DRONE') || movement.startsWith('CRANE') || movement.startsWith('BOOM')) {
      movement = purpose === 'SHOW_SCALE' ? 'PULL_OUT' : 'STATIC';
      rig = 'STATIC_TRIPOD';
      angle = 'EYE_LEVEL';
    }
  }
  if (framing === 'POV_FRAME') { movement = 'POV'; rig = 'POV'; }

  const optics = lensForFraming(framing);
  if (ctx.previous?.focalLength) {
    const a = parseInt(ctx.previous.focalLength, 10);
    const b = parseInt(optics.focalLength, 10);
    if (!Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) > 60 && ctx.shotNumber > 1) {
      optics.lens = '50mm'; optics.focalLength = '50mm';
    }
  }

  return {
    cameraMovement: movement,
    cameraSpeed: speed,
    cameraDirection: null,
    cameraAngle: angle,
    cameraRig: rig,
    lens: optics.lens,
    focalLength: optics.focalLength,
    framing,
    composition: compositionFor(framing, angle),
    focusMode: optics.focus,
    depthOfField: optics.dof,
    movementPurpose: purpose,
    cameraSummary: `${rig.replace(/_/g, ' ').toLowerCase()}, ${movement.replace(/_/g, ' ').toLowerCase()}`,
    movementSummary: `${movement} @ ${speed} on ${rig}`,
  };
}

export function reasonSceneCameraPlans(
  shots: Array<{ shotNumber: number; shotType?: string | null; action?: string | null }>,
  sceneCtx: Omit<ShotCameraContext, 'shotNumber' | 'totalShotsInScene' | 'previous' | 'shotType' | 'action'>
): ShotCameraPlan[] {
  const plans: ShotCameraPlan[] = [];
  for (let i = 0; i < shots.length; i++) {
    plans.push(reasonCameraPlan({
      ...sceneCtx,
      shotNumber: shots[i].shotNumber,
      totalShotsInScene: shots.length,
      shotType: shots[i].shotType,
      action: shots[i].action,
      previous: plans[i - 1] || null,
    }));
  }
  return plans;
}
