
import {
  segmentChapterDeterministic,
  repairCoverageOrFallback,
  assertFullCoverage,
} from '../../src/utils/deterministic-scene-segmentation';

const SAMPLE = [
  'It was a cold morning in the village.',
  '',
  'John walked toward the old mill, his coat pulled tight against the wind.',
  '',
  'Inside, the gears groaned. Dust hung in the air like smoke.',
  '',
  'He remembered his father teaching him the trade, years before the war.',
  '',
  'A shadow moved near the water wheel. John froze.',
  '',
  'Then the door slammed shut behind him.',
].join('\n');

describe('segmentChapterDeterministic', () => {
  it('covers 100% with no gaps or overlaps', () => {
    const scenes = segmentChapterDeterministic(SAMPLE, { targetWordsPerScene: 20, wpm: 150 });
    const check = assertFullCoverage(SAMPLE, scenes);
    expect(check.ok).toBe(true);
    expect(scenes[0].sourceStart).toBe(0);
    expect(scenes[scenes.length - 1].sourceEnd).toBe(SAMPLE.length);
    expect(scenes.map((s) => s.sourceText).join('')).toBe(SAMPLE);
  });

  it('produces provider-safe shot durations', () => {
    const scenes = segmentChapterDeterministic(SAMPLE, { targetWordsPerScene: 15, maxShotSec: 8, minShotSec: 2 });
    for (const scene of scenes) {
      expect(scene.shots.length).toBeGreaterThan(0);
      for (const shot of scene.shots) {
        expect(shot.durationSec).toBeLessThanOrEqual(8);
        expect(shot.durationSec).toBeGreaterThanOrEqual(2);
        expect(shot.sourceTextSegment.length).toBeGreaterThan(0);
        expect(shot.camera).toBeTruthy();
        expect(shot.lens).toBeTruthy();
      }
      const sum = scene.shots.reduce((a, s) => a + s.durationSec, 0);
      expect(Math.abs(sum - scene.estimatedDurationSec)).toBeLessThan(1.5);
    }
  });

  it('handles single paragraph with no blank lines', () => {
    const text = 'One continuous block of text without paragraph breaks that still must be fully covered by deterministic segmentation.';
    const scenes = segmentChapterDeterministic(text, { targetWordsPerScene: 10 });
    expect(assertFullCoverage(text, scenes).ok).toBe(true);
  });

  it('handles empty text', () => {
    expect(segmentChapterDeterministic('')).toEqual([]);
  });
});

describe('repairCoverageOrFallback', () => {
  it('repairs gaps between AI proposals', () => {
    const text = 'AAAA\n\nBBBB\n\nCCCC';
    const broken = [
      { sourceStart: 0, sourceEnd: 4 },
      { sourceStart: 10, sourceEnd: text.length }, // gap in middle
    ];
    const repaired = repairCoverageOrFallback(text, broken, { targetWordsPerScene: 5 });
    expect(assertFullCoverage(text, repaired).ok).toBe(true);
  });

  it('falls back when proposals are empty', () => {
    const text = 'Hello world.\n\nSecond paragraph.';
    const scenes = repairCoverageOrFallback(text, [], { targetWordsPerScene: 5 });
    expect(assertFullCoverage(text, scenes).ok).toBe(true);
  });
});
