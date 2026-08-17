import { chunkTextHierarchical, segmentByParagraphs, splitDurationIntoShots } from '../../src/utils/text-chunking';

describe('chunkTextHierarchical', () => {
  it('covers entire text with no gaps or overlaps', () => {
    const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500) + '\n\n' + 'C'.repeat(500);
    const chunks = chunkTextHierarchical(text, 400);
    expect(chunks[0].start).toBe(0);
    expect(chunks[chunks.length - 1].end).toBe(text.length);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBe(chunks[i - 1].end);
    }
    expect(chunks.map((c) => c.text).join('')).toBe(text);
  });

  it('returns single chunk when under max', () => {
    const chunks = chunkTextHierarchical('hello world', 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hello world');
  });
});

describe('segmentByParagraphs', () => {
  it('covers 100% of chapter', () => {
    const text = 'Para one.\n\nPara two is longer here.\n\nPara three ends.';
    const scenes = segmentByParagraphs(text, 5);
    expect(scenes[0].sourceStart).toBe(0);
    expect(scenes[scenes.length - 1].sourceEnd).toBe(text.length);
    for (let i = 1; i < scenes.length; i++) {
      expect(scenes[i].sourceStart).toBe(scenes[i - 1].sourceEnd);
    }
  });
});

describe('splitDurationIntoShots', () => {
  it('splits 40s into provider-safe clips', () => {
    const durs = splitDurationIntoShots(40, 8, 2);
    expect(durs.every((d) => d <= 8 && d >= 2)).toBe(true);
    expect(Math.abs(durs.reduce((a, b) => a + b, 0) - 40)).toBeLessThan(1);
    expect(durs.length).toBeGreaterThan(1);
  });
});
