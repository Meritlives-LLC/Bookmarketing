import { selectGroundedShotSource, validateSceneGrounding } from '../../src/services/scene-grounding-validator.service';

describe('validateSceneGrounding', () => {
  const knownCharacters = [{ name: 'Adaeze Okafor', aliases: ['Ada'] }, { name: 'Baba Tunde', aliases: ['Uncle Tunde'] }];
  const knownLocations = [
    { name: 'the family compound', country: 'Nigeria', city: 'Lagos', culturalContext: 'Yoruba compound with corrugated iron roofing' },
  ];

  it('passes a scene whose characters and location are real and appear in its own source text', () => {
    const result = validateSceneGrounding(
      {
        sourceText: 'Adaeze crossed the compound, greeting Baba Tunde at the gate.',
        characters: ['Adaeze Okafor', 'Baba Tunde'],
        location: 'the family compound',
        action: 'Adaeze crossed the compound and greeted Baba Tunde',
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails a scene with no source text at all — nothing to trace to the book', () => {
    const result = validateSceneGrounding(
      { sourceText: '', characters: ['Adaeze Okafor'], location: 'the family compound', action: 'Adaeze crosses the compound' },
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
        action: 'A stranger appeared in the doorway',
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
        action: 'Baba Tunde sat alone',
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
        action: 'Adaeze walked through the market square',
      },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/not in this project's location bible/i);
  });

  it('allows a scene with no location claimed at all (nothing invented)', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Adaeze thought about the letter for a long time.', characters: ['Adaeze Okafor'], location: null, action: 'Adaeze thought about the letter' },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
  });

  it('matches a character referred to by only their first name in the excerpt', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Adaeze smiled quietly to herself.', characters: ['Adaeze Okafor'], location: null, action: 'Adaeze smiled quietly' },
      knownCharacters,
      knownLocations
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a real character at a real location when the event is invented', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Ada escaped from the burning compound.', characters: ['Adaeze Okafor'], location: 'the family compound', action: 'Ada walks peacefully through a market' },
      knownCharacters, knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/action.event.*not supported/i);
  });

  it('rejects a known location when this scene's source supports a different place', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Ada walked through the market square.', characters: ['Adaeze Okafor'], location: 'the family compound', action: 'Ada walked through the market square' },
      knownCharacters, knownLocations
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/Location.*not supported/i);
  });

  it('resolves an alias and a pronoun only through immediate context', () => {
    const alias = validateSceneGrounding(
      { sourceText: 'Ada opened the letter.', characters: ['Adaeze Okafor'], location: null, action: 'Ada opened the letter' }, knownCharacters, knownLocations
    );
    const pronoun = validateSceneGrounding(
      { sourceText: 'She opened the letter.', contextText: 'Adaeze entered the house. ', characters: ['Adaeze Okafor'], location: null, action: 'She opened the letter' }, knownCharacters, knownLocations
    );
    expect(alias.ok).toBe(true);
    expect(pronoun.ok).toBe(true);
  });

  it('rejects unsupported objects and contradictory emotional context', () => {
    const result = validateSceneGrounding(
      { sourceText: 'Ada wept beside the letter.', characters: ['Adaeze Okafor'], location: null, props: ['sword'], action: 'Ada wept beside the letter', emotionalBeat: 'joyful celebration' },
      knownCharacters, knownLocations, [{ name: 'sword' }]
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/Object.*not supported|Emotional context/i);
  });

  describe('semantic event meaning', () => {
    const john = [{ name: 'John' }];
    const house = [{ name: 'the house' }];

    it('accepts the source event and a directional paraphrase', () => {
      expect(validateSceneGrounding(
        { sourceText: 'John entered the house.', characters: ['John'], location: 'the house', action: 'John walked into the house' }, john, house
      ).ok).toBe(true);
    });

    it('rejects leaving when the source says entering', () => {
      const result = validateSceneGrounding(
        { sourceText: 'John entered the house.', characters: ['John'], location: 'the house', action: 'John left the house' }, john, house
      );
      expect(result.ok).toBe(false);
      expect(result.issues.join(' ')).toMatch(/contradicts/i);
    });

    it('rejects an invented attack despite shared subject and object tokens', () => {
      const result = validateSceneGrounding(
        { sourceText: 'John ran away from the burning house.', characters: ['John'], location: 'the house', action: 'John attacked the burning house' }, john, house
      );
      expect(result.ok).toBe(false);
      expect(result.issues.join(' ')).toMatch(/contradicts|not supported/i);
    });

    it('rejects calm walking when the source says Mary fled the village', () => {
      const result = validateSceneGrounding(
        { sourceText: 'Mary ran away from the village.', characters: ['Mary'], location: 'the village', action: 'Mary walked calmly through the village' }, [{ name: 'Mary' }], [{ name: 'the village' }]
      );
      expect(result.ok).toBe(false);
    });

    it('fails invented unknown verbs that only share people and nouns', () => {
      const david = [{ name: 'David' }];
      const location = [{ name: 'the house' }];
      expect(validateSceneGrounding(
        { sourceText: 'David watched the fire from the house.', characters: ['David'], location: 'the house', action: 'David started the fire at the house' }, david, location
      ).ok).toBe(false);
      expect(validateSceneGrounding(
        { sourceText: 'Peter discovered the body.', characters: ['Peter'], location: null, action: 'Peter hid the body' }, [{ name: 'Peter' }], []
      ).ok).toBe(false);
    });

    it('preserves participant roles and important objects', () => {
      const people = [{ name: 'John' }, { name: 'Peter' }];
      expect(validateSceneGrounding(
        { sourceText: 'John attacked Peter.', characters: ['John', 'Peter'], location: null, action: 'Peter attacked John' }, people, []
      ).ok).toBe(false);
      expect(validateSceneGrounding(
        { sourceText: 'John picked up the knife.', characters: ['John'], location: null, action: 'John picked up the book' }, [{ name: 'John' }], []
      ).ok).toBe(false);
    });

    it('allows source-supported cinematic sub-actions but rejects relationship changes', () => {
      expect(validateSceneGrounding(
        { sourceText: 'John entered the house.', characters: ['John'], location: 'the house', action: 'John approached the house' }, john, house
      ).ok).toBe(true);
      expect(validateSceneGrounding(
        { sourceText: "John's sister Mary entered the room.", characters: ['John', 'Mary'], location: 'the room', action: "John's wife Mary entered the room" }, [{ name: 'John' }, { name: 'Mary' }], [{ name: 'the room' }]
      ).ok).toBe(false);
    });
  });
});

describe('selectGroundedShotSource', () => {
  it('keeps a real shot excerpt but replaces an invented provider-prompt segment with scene evidence', () => {
    const source = 'John entered the house and found Mary by the window.';
    expect(selectGroundedShotSource(source, 'found Mary by the window')).toBe('found Mary by the window');
    expect(selectGroundedShotSource(source, 'John attacked Mary with a knife.')).toBe(source);
  });
});
