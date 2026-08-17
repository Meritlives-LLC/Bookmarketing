import { ManuscriptFileType } from '@prisma/client';
import { extractManuscriptText } from '../../src/utils/text-extraction';

describe('extractManuscriptText — TXT', () => {
  it('preserves text exactly, normalizing only line endings', async () => {
    const original = 'Line one.\r\nLine two.\r\n\r\nParagraph two.';
    const buffer = Buffer.from(original, 'utf-8');

    const result = await extractManuscriptText(buffer, ManuscriptFileType.TXT);

    expect(result.text).toBe('Line one.\nLine two.\n\nParagraph two.');
    expect(result.wordCount).toBe(6);
    expect(result.warnings).toHaveLength(0);
  });

  it('flags likely encoding problems without discarding the text', async () => {
    // Bytes that are not valid UTF-8 sequences on their own.
    const buffer = Buffer.from([0xff, 0xfe, 0xff, 0xfe, 0xff, 0xfe, 0x41, 0x42, 0x43]);
    const result = await extractManuscriptText(buffer, ManuscriptFileType.TXT);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
