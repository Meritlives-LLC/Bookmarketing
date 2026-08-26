import { validateSceneGrounding } from '../../src/services/scene-grounding-validator.service';

describe('validateSceneGrounding', () => {
  const knownCharacters = [{ name: 'Adaeze Okafor' }, { name: 'Baba Tunde' }];
  const knownLocations = [
    { name: 'the family compound', country: 'Nigeria', city: 'Lagos', culturalContext: 'Yoruba compound with corrugated iron roofing' },
  ];

  it('passes a scene whose characters and location are real and appear in its own source text', () => {
    const result = validateSceneGrounding(
      {
        sourceText: 'Adaeze crossed the compound, greeting Baba Tunde at the gate.',
        characters: ['Adaeze Okafor', 'Baba Tunde'],
        location: 'the family compound',
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails a scene with no source text at all — nothing to trace to the book', () => {
    const result = validateSceneGrounding(
      { sourceText: '', characters: ['Adaeze Okafor'], location: 'the family compound' },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/no source text/i);
  });

  it('fails a scene that lists a character not in the project character bible (invented character)', () => {
    const result = validateSceneGrounding(
      {
        sourceText: 'A stranger appeared in the doorway.',
        characters: ['Someone Made Up'],
        location: null,
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/not in this project's character bible/i);
  });

  it('fails a scene whose listed character never appears in that scene\'s own source excerpt', () => {
    const result = validateSceneGrounding(
      {
        sourceText: 'Baba Tunde sat alone in the quiet compound.',
        characters: ['Adaeze Okafor'],
        location: 'the family compound',
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/does not appear in this scene's own source text/i);
  });

  it('fails a scene that claims a location never extracted from the book (invented setting)', () => {
    const result = validateSceneGrounding(
      {
        sourceText: 'Adaeze walked through the market square.',
        characters: ['Adaeze Okafor'],
        location: 'a generic African village',
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/not in this project's location bible/i);
  });

  it('allows a scene with no location claimed at all (nothing invented)', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Adaeze thought about the letter for a long time.', characters: ['Adaeze Okafor'], location: null },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
  });

  it('matches a character referred to by only their first name in the excerpt', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Adaeze smiled quietly to herself.', characters: ['Adaeze Okafor'], location: null },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
  });
});
