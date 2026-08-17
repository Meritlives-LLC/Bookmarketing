import { segmentChapters } from '../../src/utils/chapter-segmentation';

function repeatWords(word: string, count: number): string {
  return new Array(count).fill(word).join(' ');
}

describe('segmentChapters — heading detection', () => {
  it('splits on "Chapter N" headings and preserves exact source text', () => {
    const text =
      `Chapter 1\n\n${repeatWords('alpha', 900)}\n\n` +
      `Chapter 2\n\n${repeatWords('beta', 900)}\n\n` +
      `Chapter 3\n\n${repeatWords('gamma', 900)}`;

    const segments = segmentChapters(text);

    expect(segments).toHaveLength(3);
    expect(segments[0].chapterNumber).toBe(1);
    expect(segments[1].chapterNumber).toBe(2);
    expect(segments[2].chapterNumber).toBe(3);

    // Word-for-word fidelity: every segment's sourceText must be an exact
    // substring of the original manuscript text.
    for (const segment of segments) {
      expect(text.slice(segment.startPosition, segment.endPosition)).toBe(segment.sourceText);
      expect(text.includes(segment.sourceText)).toBe(true);
    }

    // The three segments must reconstruct the full text with no gaps/overlaps.
    expect(segments[0].startPosition).toBe(0);
    expect(segments[2].endPosition).toBe(text.length);
    expect(segments[0].endPosition).toBe(segments[1].startPosition);
    expect(segments[1].endPosition).toBe(segments[2].startPosition);
  });

  it('recognizes spelled-out chapter numbers ("CHAPTER ONE")', () => {
    const text =
      `CHAPTER ONE\n\n${repeatWords('word', 900)}\n\n` +
      `CHAPTER TWO\n\n${repeatWords('word', 900)}`;
    const segments = segmentChapters(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].extractionMetadata.parsedNumber).toBe(1);
    expect(segments[1].extractionMetadata.parsedNumber).toBe(2);
  });

  it('recognizes roman numeral chapter headings', () => {
    const text =
      `Chapter IV\n\n${repeatWords('word', 900)}\n\n` +
      `Chapter V\n\n${repeatWords('word', 900)}`;
    const segments = segmentChapters(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].extractionMetadata.parsedNumber).toBe(4);
    expect(segments[1].extractionMetadata.parsedNumber).toBe(5);
  });

  it('captures a same-line chapter title', () => {
    const text =
      `Chapter 1: The Beginning\n\n${repeatWords('word', 900)}\n\n` +
      `Chapter 2 - A New Dawn\n\n${repeatWords('word', 900)}`;
    const segments = segmentChapters(text);
    expect(segments[0].title).toBe('The Beginning');
    expect(segments[1].title).toBe('A New Dawn');
  });

  it('recognizes Prologue and Epilogue as their own segments', () => {
    const text =
      `Prologue\n\n${repeatWords('word', 900)}\n\n` +
      `Chapter 1\n\n${repeatWords('word', 900)}\n\n` +
      `Epilogue\n\n${repeatWords('word', 900)}`;
    const segments = segmentChapters(text);
    expect(segments).toHaveLength(3);
    expect(segments[0].extractionMetadata.kind).toBe('prologue');
    expect(segments[1].extractionMetadata.kind).toBe('chapter');
    expect(segments[2].extractionMetadata.kind).toBe('epilogue');
  });

  it('ignores a table-of-contents cluster near the start of the file', () => {
    const toc = ['Chapter 1', 'Chapter 2', 'Chapter 3'].join('\n');
    const text =
      `Table of Contents\n\n${toc}\n\n` +
      `Chapter 1\n\n${repeatWords('word', 900)}\n\n` +
      `Chapter 2\n\n${repeatWords('word', 900)}\n\n` +
      `Chapter 3\n\n${repeatWords('word', 900)}`;

    const segments = segmentChapters(text);

    // The ToC's tightly-clustered headings must not produce near-empty
    // leading chapters — real content should start at the real Chapter 1.
    expect(segments.every((s) => s.wordCount > 100)).toBe(true);
  });
});

describe('segmentChapters — fallback chunking (no headings)', () => {
  it('splits continuous prose into paragraph-safe chunks without headings', () => {
    const paragraphs: string[] = [];
    for (let i = 0; i < 12; i++) {
      paragraphs.push(repeatWords(`para${i}`, 500));
    }
    const text = paragraphs.join('\n\n');

    const segments = segmentChapters(text);

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.extractionMetadata.detectionMethod).toBe('fallback-chunk');
      // Never splits mid-paragraph: every segment boundary is a paragraph edge.
      expect(text.slice(segment.startPosition, segment.endPosition)).toBe(segment.sourceText);
    }
    // Sequential numbering, no gaps.
    segments.forEach((s, i) => expect(s.chapterNumber).toBe(i + 1));
  });

  it('returns the whole text as one chapter when it is shorter than the fallback target', () => {
    const text = repeatWords('word', 300);
    const segments = segmentChapters(text);
    expect(segments).toHaveLength(1);
    expect(segments[0].sourceText).toBe(text);
  });

  it('never splits a paragraph in half', () => {
    const bigParagraph = repeatWords('word', 5000); // exceeds FALLBACK_MAX_WORDS on its own
    const text = `${repeatWords('intro', 100)}\n\n${bigParagraph}\n\n${repeatWords('outro', 100)}`;
    const segments = segmentChapters(text);
    for (const segment of segments) {
      // A paragraph never appears truncated at a boundary — every segment
      // starts/ends exactly at a paragraph edge (blank-line boundary or text edge).
      const before = text[segment.startPosition - 1];
      const after = text[segment.endPosition];
      expect(before === undefined || before === '\n').toBe(true);
      expect(after === undefined || after === '\n').toBe(true);
    }
  });

  it('returns no segments for empty or whitespace-only input', () => {
    expect(segmentChapters('')).toHaveLength(0);
    expect(segmentChapters('   \n\n  \n')).toHaveLength(0);
  });
});
