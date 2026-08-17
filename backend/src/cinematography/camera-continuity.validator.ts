/**
 * Advisory camera continuity validator (VideoShot level).
 * WARN only — never blocks generation.
 */
import { normalizeShotCamera, type LegacyShotFields } from './legacy-normalize';
import type { MovementPurpose, ShotCameraPlan } from './camera-types';

export type ContinuitySeverity = 'INFO' | 'WARNING';

export interface ContinuityIssue {
  severity: ContinuitySeverity;
  message: string;
  affectedParameter: string;
  previousValue?: string | null;
  currentValue?: string | null;
  suggestion?: string;
}

export interface CameraContinuityResult {
  /** Advisory only — false does NOT block generation. */
  valid: boolean;
  severity: ContinuitySeverity | 'OK';
  score: number;
  issues: ContinuityIssue[];
  suggestions: string[];
}

export interface ContinuityShotInput extends LegacyShotFields {
  durationSec?: number | null;
  action?: string | null;
}

export interface ContinuityContext {
  emotionalBeat?: string | null;
  sceneType?: string | null;
  locationKind?: 'interior' | 'exterior' | 'unknown';
  locationScale?: 'small' | 'medium' | 'large' | 'vast' | 'unknown';
  locationName?: string | null;
}

const INTENTIONAL_BREAK_PURPOSES: MovementPurpose[] = [
  'CREATE_DISORIENTATION',
  'REVEAL_INFORMATION',
  'TRANSITION',
  'FOLLOW_ACTION',
];

const OPPOSITE_MOVES: Record<string, string[]> = {
  PAN_LEFT: ['PAN_RIGHT'],
  PAN_RIGHT: ['PAN_LEFT'],
  TILT_UP: ['TILT_DOWN'],
  TILT_DOWN: ['TILT_UP'],
  DOLLY_IN: ['DOLLY_OUT', 'PULL_OUT'],
  DOLLY_OUT: ['DOLLY_IN', 'PUSH_IN'],
  PUSH_IN: ['PULL_OUT', 'DOLLY_OUT'],
  PULL_OUT: ['PUSH_IN', 'DOLLY_IN'],
  CRANE_UP: ['CRANE_DOWN'],
  CRANE_DOWN: ['CRANE_UP'],
  BOOM_UP: ['BOOM_DOWN'],
  BOOM_DOWN: ['BOOM_UP'],
  DRONE_RISE: ['DRONE_DESCEND'],
  DRONE_DESCEND: ['DRONE_RISE'],
  DRONE_FORWARD: ['DRONE_BACKWARD'],
  DRONE_BACKWARD: ['DRONE_FORWARD'],
  ZOOM_IN: ['ZOOM_OUT'],
  ZOOM_OUT: ['ZOOM_IN'],
};

const SPEED_RANK: Record<string, number> = {
  VERY_SLOW: 0,
  SLOW: 1,
  MEDIUM: 2,
  FAST: 3,
  VERY_FAST: 4,
};

const FRAMING_RANK: Record<string, number> = {
  EXTREME_WIDE: 0,
  WIDE: 1,
  FULL: 2,
  MEDIUM_WIDE: 3,
  MEDIUM: 4,
  TWO_SHOT: 4,
  OVER_SHOULDER: 5,
  MEDIUM_CLOSE_UP: 5,
  CLOSE_UP: 6,
  EXTREME_CLOSE_UP: 7,
  INSERT: 7,
  CUTAWAY: 4,
  POV_FRAME: 5,
};

function parseFocal(v?: string | null): number | null {
  if (!v) return null;
  const m = String(v).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function intentionalBreak(ctx: ContinuityContext | undefined, current: ShotCameraPlan, prev: ShotCameraPlan): boolean {
  if (INTENTIONAL_BREAK_PURPOSES.includes(current.movementPurpose)) return true;
  if (INTENTIONAL_BREAK_PURPOSES.includes(prev.movementPurpose)) return true;
  const beat = (ctx?.emotionalBeat || '').toLowerCase();
  const markers = [
    'action', 'chase', 'horror', 'shock', 'dream', 'nightmare', 'flashback',
    'montage', 'transition', 'psychological', 'disorient', 'reveal', 'pov',
  ];
  return markers.some((m) => beat.includes(m));
}

function scoreFromIssues(issues: ContinuityIssue[]): number {
  if (!issues.length) return 100;
  let score = 100;
  for (const i of issues) {
    score -= i.severity === 'WARNING' ? 15 : 5;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Validate continuity between previous and current shot.
 * First shot (no previous) → always OK.
 * Missing camera params → no crash, skip checks.
 */
export function validateCameraContinuity(
  previousShot: ContinuityShotInput | null | undefined,
  currentShot: ContinuityShotInput,
  context?: ContinuityContext
): CameraContinuityResult {
  const issues: ContinuityIssue[] = [];
  const suggestions: string[] = [];

  if (!previousShot) {
    return { valid: true, severity: 'OK', score: 100, issues: [], suggestions: [] };
  }

  const prev = normalizeShotCamera(previousShot);
  const curr = normalizeShotCamera(currentShot);
  const intentional = intentionalBreak(context, curr, prev);

  // --- Movement opposition ---
  const opposites = OPPOSITE_MOVES[prev.cameraMovement] || [];
  if (opposites.includes(curr.cameraMovement)) {
    if (!intentional) {
      issues.push({
        severity: 'WARNING',
        message: `Camera movement reverses from ${prev.cameraMovement} to ${curr.cameraMovement}.`,
        affectedParameter: 'cameraMovement',
        previousValue: prev.cameraMovement,
        currentValue: curr.cameraMovement,
        suggestion: 'Consider maintaining the previous direction unless the reversal is intentional.',
      });
      suggestions.push(`Keep ${prev.cameraMovement} or use STATIC as a bridge.`);
    } else {
      issues.push({
        severity: 'INFO',
        message: `Movement reverses (${prev.cameraMovement} → ${curr.cameraMovement}); allowed by narrative purpose ${curr.movementPurpose}.`,
        affectedParameter: 'cameraMovement',
        previousValue: prev.cameraMovement,
        currentValue: curr.cameraMovement,
      });
    }
  }

  // STATIC → WHIP_PAN
  if (prev.cameraMovement === 'STATIC' && curr.cameraMovement === 'WHIP_PAN' && !intentional) {
    issues.push({
      severity: 'WARNING',
      message: 'Abrupt change from STATIC to WHIP_PAN.',
      affectedParameter: 'cameraMovement',
      previousValue: 'STATIC',
      currentValue: 'WHIP_PAN',
      suggestion: 'Use WHIP_PAN for shock/reveal only; otherwise ease with PAN or TRACKING.',
    });
  }

  // --- Direction (free-text) ---
  const pd = (previousShot.cameraDirection || '').toLowerCase();
  const cd = (currentShot.cameraDirection || '').toLowerCase();
  if (pd && cd) {
    const pairs: [string, string][] = [
      ['left', 'right'],
      ['forward', 'backward'],
      ['up', 'down'],
      ['orbit_left', 'orbit_right'],
      ['orbit left', 'orbit right'],
    ];
    for (const [a, b] of pairs) {
      if ((pd.includes(a) && cd.includes(b)) || (pd.includes(b) && cd.includes(a))) {
        issues.push({
          severity: intentional ? 'INFO' : 'WARNING',
          message: `Camera direction reverses between consecutive shots (${previousShot.cameraDirection} → ${currentShot.cameraDirection}).`,
          affectedParameter: 'cameraDirection',
          previousValue: previousShot.cameraDirection,
          currentValue: currentShot.cameraDirection,
          suggestion: 'Consider maintaining the previous direction unless the reversal is intentional.',
        });
        break;
      }
    }
  }

  // --- Lens / focal length ---
  const fPrev = parseFocal(prev.focalLength || prev.lens);
  const fCurr = parseFocal(curr.focalLength || curr.lens);
  if (fPrev != null && fCurr != null) {
    const delta = Math.abs(fPrev - fCurr);
    if (delta >= 80 && !intentional) {
      issues.push({
        severity: 'WARNING',
        message: `Large lens change from ${fPrev}mm to ${fCurr}mm.`,
        affectedParameter: 'focalLength',
        previousValue: `${fPrev}mm`,
        currentValue: `${fCurr}mm`,
        suggestion: 'Bridge with an intermediate focal length (e.g. 50mm) unless the jump is intentional.',
      });
    } else if (delta >= 40 && delta < 80 && !intentional) {
      issues.push({
        severity: 'INFO',
        message: `Moderate lens change from ${fPrev}mm to ${fCurr}mm.`,
        affectedParameter: 'focalLength',
        previousValue: `${fPrev}mm`,
        currentValue: `${fCurr}mm`,
      });
    }
  }

  // --- Framing ---
  const rPrev = FRAMING_RANK[prev.framing];
  const rCurr = FRAMING_RANK[curr.framing];
  if (rPrev != null && rCurr != null && Math.abs(rPrev - rCurr) >= 5) {
    issues.push({
      severity: intentional ? 'INFO' : 'WARNING',
      message: `Large framing change detected (${prev.framing} → ${curr.framing}). This may be intentional for dramatic emphasis.`,
      affectedParameter: 'framing',
      previousValue: prev.framing,
      currentValue: curr.framing,
      suggestion: intentional
        ? undefined
        : 'Add a medium bridge shot if the cut feels too abrupt.',
    });
  }

  // --- Speed ---
  const sPrev = SPEED_RANK[prev.cameraSpeed];
  const sCurr = SPEED_RANK[curr.cameraSpeed];
  if (sPrev != null && sCurr != null && Math.abs(sPrev - sCurr) >= 3 && !intentional) {
    issues.push({
      severity: 'WARNING',
      message: `Major camera speed change from ${prev.cameraSpeed} to ${curr.cameraSpeed}.`,
      affectedParameter: 'cameraSpeed',
      previousValue: prev.cameraSpeed,
      currentValue: curr.cameraSpeed,
      suggestion: 'Ease speed across shots unless pacing intentionally shifts.',
    });
  }

  // --- Rig ---
  if (prev.cameraRig !== curr.cameraRig) {
    const major =
      (prev.cameraRig === 'STATIC_TRIPOD' && (curr.cameraRig === 'HANDHELD' || curr.cameraRig === 'DRONE')) ||
      (prev.cameraRig === 'HANDHELD' && curr.cameraRig === 'DRONE') ||
      (prev.cameraRig === 'DOLLY' && (curr.cameraRig === 'CRANE' || curr.cameraRig === 'DRONE'));
    if (major && !intentional) {
      issues.push({
        severity: 'WARNING',
        message: `Camera rig changes from ${prev.cameraRig} to ${curr.cameraRig}.`,
        affectedParameter: 'cameraRig',
        previousValue: prev.cameraRig,
        currentValue: curr.cameraRig,
        suggestion: 'Confirm the rig change is motivated by story or style.',
      });
    }
  }

  // --- Unlikely environment combos (current shot alone) ---
  if (context?.locationKind === 'interior' && context?.locationScale === 'small') {
    if (
      curr.cameraMovement.startsWith('DRONE') ||
      curr.cameraMovement.startsWith('CRANE') ||
      curr.cameraMovement.startsWith('BOOM')
    ) {
      issues.push({
        severity: 'WARNING',
        message: `${curr.cameraMovement} is unlikely in a small interior (${context.locationName || 'room'}).`,
        affectedParameter: 'cameraMovement',
        currentValue: curr.cameraMovement,
        suggestion: 'Prefer STATIC, PUSH_IN, or PULL_OUT indoors unless stylized.',
      });
    }
  }

  const warnings = issues.filter((i) => i.severity === 'WARNING');
  const score = scoreFromIssues(issues);
  return {
    valid: warnings.length === 0,
    severity: warnings.length ? 'WARNING' : issues.length ? 'INFO' : 'OK',
    score,
    issues,
    suggestions: [...new Set(suggestions)],
  };
}

/**
 * Soft-fix current shot camera toward previous (camera params only).
 * Does not touch source text, characters, locations, or story.
 */
export function suggestContinuityFix(
  previousShot: ContinuityShotInput,
  currentShot: ContinuityShotInput
): ShotCameraPlan {
  const prev = normalizeShotCamera(previousShot);
  const curr = normalizeShotCamera(currentShot);
  const fixed: ShotCameraPlan = { ...curr };

  const opposites = OPPOSITE_MOVES[prev.cameraMovement] || [];
  if (opposites.includes(curr.cameraMovement)) {
    fixed.cameraMovement = prev.cameraMovement;
    fixed.movementSummary = `${prev.cameraMovement} @ ${curr.cameraSpeed}`;
  }

  const fPrev = parseFocal(prev.focalLength || prev.lens);
  const fCurr = parseFocal(curr.focalLength || curr.lens);
  if (fPrev != null && fCurr != null && Math.abs(fPrev - fCurr) >= 80) {
    const mid = Math.round((fPrev + fCurr) / 2);
    // snap to common primes
    const primes = [24, 35, 50, 85];
    const nearest = primes.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a), 50);
    fixed.focalLength = `${nearest}mm`;
    fixed.lens = `${nearest}mm`;
  }

  const rPrev = FRAMING_RANK[prev.framing];
  const rCurr = FRAMING_RANK[curr.framing];
  if (rPrev != null && rCurr != null && Math.abs(rPrev - rCurr) >= 5) {
    // step one rank toward previous
    const step = rCurr > rPrev ? rCurr - 2 : rCurr + 2;
    const entry = Object.entries(FRAMING_RANK).find(([, r]) => r === Math.max(0, Math.min(7, step)));
    if (entry) fixed.framing = entry[0] as ShotCameraPlan['framing'];
  }

  const sPrev = SPEED_RANK[prev.cameraSpeed];
  const sCurr = SPEED_RANK[curr.cameraSpeed];
  if (sPrev != null && sCurr != null && Math.abs(sPrev - sCurr) >= 3) {
    fixed.cameraSpeed = prev.cameraSpeed;
  }

  if (
    (prev.cameraRig === 'STATIC_TRIPOD' && curr.cameraRig === 'DRONE') ||
    (prev.cameraRig === 'HANDHELD' && curr.cameraRig === 'DRONE')
  ) {
    fixed.cameraRig = prev.cameraRig;
  }

  fixed.cameraSummary = `${fixed.cameraRig} ${fixed.cameraMovement}`.toLowerCase().replace(/_/g, ' ');
  fixed.movementSummary = `${fixed.cameraMovement} @ ${fixed.cameraSpeed}`;
  return fixed;
}
