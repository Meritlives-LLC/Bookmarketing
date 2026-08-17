import { reasonCameraPlan, reasonSceneCameraPlans } from '../../src/cinematography/camera-reasoning';
import { validateCameraPlan } from '../../src/cinematography/camera-validation';
import { compileShotPrompt } from '../../src/cinematography/compile-shot-prompt';
import { normalizeShotCamera } from '../../src/cinematography/legacy-normalize';
import { shotPromptCompilerService } from '../../src/services/shot-prompt-compiler.service';
import { ALL_CAMERA_MOVEMENTS, ALL_CAMERA_SPEEDS } from '../../src/cinematography/camera-types';

describe('camera enums', () => {
  it('includes required movements', () => {
    expect(ALL_CAMERA_MOVEMENTS).toContain('STATIC');
    expect(ALL_CAMERA_MOVEMENTS).toContain('PUSH_IN');
    expect(ALL_CAMERA_MOVEMENTS).toContain('DRONE_RISE');
    expect(ALL_CAMERA_MOVEMENTS).toContain('POV');
  });
  it('includes speeds', () => {
    expect(ALL_CAMERA_SPEEDS).toEqual(['VERY_SLOW', 'SLOW', 'MEDIUM', 'FAST', 'VERY_FAST']);
  });
});

describe('legacy normalize', () => {
  it('maps free-text legacy fields', () => {
    const plan = normalizeShotCamera({
      camera: 'tripod locked',
      movement: 'slow push in',
      lens: '85mm',
      shotType: 'close-up',
    });
    expect(plan.cameraMovement).toBe('PUSH_IN');
    expect(plan.lens).toBe('85mm');
    expect(plan.framing).toBe('CLOSE_UP');
  });

  it('prefers structured fields over legacy', () => {
    const plan = normalizeShotCamera({
      cameraMovement: 'STATIC',
      cameraSpeed: 'SLOW',
      framing: 'WIDE',
      lens: '24mm',
      movement: 'fast whip pan',
    });
    expect(plan.cameraMovement).toBe('STATIC');
    expect(plan.framing).toBe('WIDE');
  });
});

describe('prompt compiler', () => {
  it('produces natural language not JSON dump', () => {
    const out = compileShotPrompt({
      baseVisual: 'John stands in the dark forest',
      camera: {
        cameraMovement: 'PUSH_IN',
        cameraSpeed: 'SLOW',
        cameraAngle: 'EYE_LEVEL',
        cameraRig: 'DOLLY',
        lens: '50mm',
        focalLength: '50mm',
        framing: 'MEDIUM_CLOSE_UP',
        composition: 'eyes on upper third',
        focusMode: 'FIXED',
        depthOfField: 'SHALLOW',
        movementPurpose: 'BUILD_TENSION',
        cameraSummary: 'dolly push in',
        movementSummary: 'PUSH_IN @ SLOW',
      },
    });
    expect(out.prompt.toLowerCase()).toContain('push');
    expect(out.prompt).toContain('50mm');
    expect(out.prompt).not.toMatch(/"cameraMovement"/);
    expect(out.prompt).toContain('Cinematography');
  });

  it('compiler service includes character continuity without altering identity via camera', () => {
    const out = shotPromptCompilerService.compile({
      sourceTextSegment: 'John walks toward the door',
      filmStyle: 'cinematic drama',
      characters: [{ name: 'John', physicalAppearance: 'tall, grey beard', clothing: 'wool coat' }],
      location: { name: 'Cabin', environment: 'snowy interior' },
      shot: {
        cameraMovement: 'FOLLOW',
        cameraSpeed: 'MEDIUM',
        cameraRig: 'STEADICAM',
        framing: 'MEDIUM_WIDE',
        lens: '35mm',
        focalLength: '35mm',
      },
      durationSec: 6,
    });
    expect(out.prompt).toMatch(/John/);
    expect(out.prompt).toMatch(/wool coat|grey beard/i);
    expect(out.negativePrompt.length).toBeGreaterThan(10);
  });
});

describe('validation', () => {
  it('flags drone in small interior', () => {
    const result = validateCameraPlan(
      {
        cameraMovement: 'DRONE_RISE',
        cameraSpeed: 'SLOW',
        cameraAngle: 'HIGH_ANGLE',
        cameraRig: 'DRONE',
        lens: '24mm',
        focalLength: '24mm',
        framing: 'WIDE',
        composition: '',
        focusMode: 'FIXED',
        depthOfField: 'DEEP',
        movementPurpose: 'SHOW_SCALE',
        cameraSummary: '',
        movementSummary: '',
      },
      { locationKind: 'interior', locationScale: 'small' }
    );
    expect(result.ok).toBe(false);
    expect(result.adjusted?.cameraMovement).toBe('STATIC');
  });
});

describe('continuity reasoning', () => {
  it('produces coherent scene camera plans', () => {
    const plans = reasonSceneCameraPlans(
      [
        { shotNumber: 1, shotType: 'establishing' },
        { shotNumber: 2, action: 'walks' },
        { shotNumber: 3, action: 'discovers' },
        { shotNumber: 4 },
        { shotNumber: 5, action: 'runs chase fight' },
      ],
      { emotionalBeat: null, locationKind: 'exterior', locationScale: 'large', intensity: 'medium' }
    );
    expect(plans).toHaveLength(5);
    expect(plans[0].movementPurpose).toBe('ESTABLISH_LOCATION');
    expect(['WIDE', 'EXTREME_WIDE']).toContain(plans[0].framing);
    // Action shot should trend toward follow/handheld/tracking
    expect(['FOLLOW', 'HANDHELD', 'TRACKING']).toContain(plans[4].cameraMovement);
  });

  it('avoids immediate reverse of push/pull', () => {
    const first = reasonCameraPlan({
      shotNumber: 1,
      totalShotsInScene: 2,
      emotionalBeat: 'tension',
      locationKind: 'unknown',
      locationScale: 'unknown',
    });
    // force previous push
    const second = reasonCameraPlan({
      shotNumber: 2,
      totalShotsInScene: 2,
      emotionalBeat: 'alone isolated',
      previous: { ...first, cameraMovement: 'PUSH_IN' },
    });
    // CREATE_DISTANCE wants PULL_OUT but continuity should force STATIC
    expect(second.cameraMovement).not.toBe('PULL_OUT');
  });
});
