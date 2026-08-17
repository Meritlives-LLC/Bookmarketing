/**
 * Provider-independent cinematic camera vocabulary for VideoShot.
 */
export type CameraMovement =
  | 'STATIC' | 'PAN_LEFT' | 'PAN_RIGHT' | 'TILT_UP' | 'TILT_DOWN'
  | 'DOLLY_IN' | 'DOLLY_OUT' | 'PUSH_IN' | 'PULL_OUT'
  | 'TRACKING' | 'FOLLOW' | 'ORBIT' | 'ARC'
  | 'CRANE_UP' | 'CRANE_DOWN' | 'BOOM_UP' | 'BOOM_DOWN'
  | 'HANDHELD' | 'STEADICAM' | 'GIMBAL'
  | 'ZOOM_IN' | 'ZOOM_OUT' | 'WHIP_PAN'
  | 'DRONE_RISE' | 'DRONE_DESCEND' | 'DRONE_FORWARD' | 'DRONE_BACKWARD'
  | 'DOLLY_ZOOM' | 'POV' | 'FIRST_PERSON' | 'CUSTOM';

export type CameraSpeed = 'VERY_SLOW' | 'SLOW' | 'MEDIUM' | 'FAST' | 'VERY_FAST';
export type CameraRig =
  | 'STATIC_TRIPOD' | 'HANDHELD' | 'STEADICAM' | 'GIMBAL' | 'DOLLY'
  | 'CRANE' | 'JIB' | 'DRONE' | 'SHOULDER' | 'POV' | 'UNKNOWN';
export type CameraAngle =
  | 'EYE_LEVEL' | 'LOW_ANGLE' | 'HIGH_ANGLE' | 'BIRDS_EYE'
  | 'WORMS_EYE' | 'DUTCH_ANGLE' | 'OVERHEAD' | 'GROUND_LEVEL'
  | 'OVER_SHOULDER' | 'TOP_DOWN' | 'BOTTOM_UP' | 'POV' | 'PROFILE' | 'THREE_QUARTER';
export type CameraFraming =
  | 'EXTREME_WIDE' | 'WIDE' | 'FULL' | 'MEDIUM_WIDE' | 'MEDIUM'
  | 'MEDIUM_CLOSE_UP' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP'
  | 'TWO_SHOT' | 'OVER_SHOULDER' | 'INSERT' | 'CUTAWAY' | 'POV_FRAME';
export type FocusMode = 'FIXED' | 'RACK_FOCUS' | 'FOLLOW_FOCUS' | 'DEEP_FOCUS' | 'SOFT_FOCUS' | 'SHALLOW_FOCUS' | 'AUTO_FOCUS' | 'SELECTIVE_FOCUS';
export type DepthOfField = 'SHALLOW' | 'MEDIUM' | 'DEEP' | 'MODERATE' | 'EXTREME_SHALLOW';
export type MovementPurpose =
  | 'ESTABLISH_LOCATION' | 'FOLLOW_CHARACTER' | 'FOLLOW_ACTION' | 'BUILD_TENSION'
  | 'CREATE_INTIMACY' | 'CREATE_DISTANCE' | 'SHOW_SCALE' | 'REVEAL_INFORMATION'
  | 'REVEAL_CHARACTER' | 'REVEAL_OBJECT' | 'EMPHASIZE_EMOTION' | 'CREATE_DISORIENTATION'
  | 'TRANSITION';

export interface ShotCameraPlan {
  cameraMovement: CameraMovement;
  cameraSpeed: CameraSpeed;
  cameraDirection?: string | null;
  cameraAngle: CameraAngle;
  cameraRig: CameraRig;
  lens: string;
  focalLength: string;
  framing: CameraFraming;
  composition: string;
  focusMode: FocusMode;
  depthOfField: DepthOfField;
  movementPurpose: MovementPurpose;
  cameraSummary: string;
  movementSummary: string;
}

export interface ShotCameraContext {
  shotNumber: number;
  totalShotsInScene: number;
  shotType?: string | null;
  action?: string | null;
  emotionalBeat?: string | null;
  locationKind?: 'interior' | 'exterior' | 'unknown';
  locationScale?: 'small' | 'medium' | 'large' | 'vast' | 'unknown';
  intensity?: 'low' | 'medium' | 'high';
  previous?: Partial<ShotCameraPlan> | null;
}

export const ALL_CAMERA_MOVEMENTS: CameraMovement[] = [
  'STATIC', 'PAN_LEFT', 'PAN_RIGHT', 'TILT_UP', 'TILT_DOWN',
  'DOLLY_IN', 'DOLLY_OUT', 'PUSH_IN', 'PULL_OUT',
  'TRACKING', 'FOLLOW', 'ORBIT', 'ARC',
  'CRANE_UP', 'CRANE_DOWN', 'BOOM_UP', 'BOOM_DOWN',
  'HANDHELD', 'STEADICAM', 'GIMBAL',
  'ZOOM_IN', 'ZOOM_OUT', 'WHIP_PAN',
  'DRONE_RISE', 'DRONE_DESCEND', 'DRONE_FORWARD', 'DRONE_BACKWARD',
  'DOLLY_ZOOM', 'POV', 'FIRST_PERSON', 'CUSTOM',
];

export const ALL_CAMERA_SPEEDS: CameraSpeed[] = ['VERY_SLOW', 'SLOW', 'MEDIUM', 'FAST', 'VERY_FAST'];
export const ALL_CAMERA_RIGS: CameraRig[] = [
  'STATIC_TRIPOD', 'HANDHELD', 'STEADICAM', 'GIMBAL', 'DOLLY', 'CRANE', 'JIB', 'DRONE', 'SHOULDER', 'POV', 'UNKNOWN',
];
export const ALL_CAMERA_ANGLES: CameraAngle[] = [
  'EYE_LEVEL', 'LOW_ANGLE', 'HIGH_ANGLE', 'BIRDS_EYE', 'WORMS_EYE', 'DUTCH_ANGLE', 'OVERHEAD', 'GROUND_LEVEL',
];
export const ALL_FRAMINGS: CameraFraming[] = [
  'EXTREME_WIDE', 'WIDE', 'FULL', 'MEDIUM_WIDE', 'MEDIUM', 'MEDIUM_CLOSE_UP',
  'CLOSE_UP', 'EXTREME_CLOSE_UP', 'TWO_SHOT', 'OVER_SHOULDER', 'INSERT', 'CUTAWAY', 'POV_FRAME',
];
export const ALL_MOVEMENT_PURPOSES: MovementPurpose[] = [
  'ESTABLISH_LOCATION', 'FOLLOW_CHARACTER', 'FOLLOW_ACTION', 'BUILD_TENSION',
  'CREATE_INTIMACY', 'CREATE_DISTANCE', 'SHOW_SCALE', 'REVEAL_INFORMATION',
  'REVEAL_CHARACTER', 'REVEAL_OBJECT', 'EMPHASIZE_EMOTION', 'CREATE_DISORIENTATION', 'TRANSITION',
];
