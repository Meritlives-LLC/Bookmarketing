import {
  buildLocationCulturalClause,
  culturalNegativeConstraints,
} from '../../src/cinematography/cultural-fidelity';
import { shotPromptCompilerService } from '../../src/services/shot-prompt-compiler.service';

describe('buildLocationCulturalClause', () => {
  it('returns null when there is nothing book-grounded to add', () => {
    expect(buildLocationCulturalClause(null)).toBeNull();
    expect(buildLocationCulturalClause({ name: 'the compound' })).toBeNull();
  });

  it('builds a clause from an African setting extracted from the book (Nigeria)', () => {
    const clause = buildLocationCulturalClause({
      name: 'the family compound',
      country: 'Nigeria',
      city: 'Lagos',
      culturalContext: 'a Yoruba family compound with corrugated iron roofing and a busy street market nearby',
    });
    expect(clause).toContain('Lagos');
    expect(clause).toContain('Nigeria');
    expect(clause).toContain('Yoruba family compound');
  });

  it('builds a clause for a foreign (non-African) setting the same way', () => {
    const clause = buildLocationCulturalClause({
      name: 'Baker Street flat',
      country: 'United Kingdom',
      city: 'London',
      culturalContext: 'a Victorian-era terraced house with gas lamps and cobblestone streets',
    });
    expect(clause).toContain('London');
    expect(clause).toContain('United Kingdom');
    expect(clause).toContain('Victorian-era');
  });

  it('builds a clause for a historical setting using region + culturalContext', () => {
    const clause = buildLocationCulturalClause({
      name: 'the castle courtyard',
      region: 'medieval France',
      culturalContext: 'stone battlements, chainmail-armored guards, torch-lit halls, no modern technology',
    });
    expect(clause).toContain('medieval France');
    expect(clause).toContain('chainmail-armored guards');
  });

  it('does NOT fabricate country/city text beyond what was passed in', () => {
    const clause = buildLocationCulturalClause({ name: 'a quiet town', country: 'Kenya' });
    expect(clause).toBe('set in Kenya');
    expect(clause).not.toMatch(/safari|hut|tribal/i);
  });
});

describe('culturalNegativeConstraints', () => {
  it('adds no constraints when a location has no country/region on record', () => {
    expect(culturalNegativeConstraints(null)).toEqual([]);
    expect(culturalNegativeConstraints({ name: 'somewhere' })).toEqual([]);
  });

  it('adds generic stereotype-suppression terms once a country is known', () => {
    const neg = culturalNegativeConstraints({ name: 'a village', country: 'Ghana' });
    expect(neg.length).toBeGreaterThan(0);
    expect(neg.join(' ')).toMatch(/safari|tribal|stock/i);
  });

  it('applies the same generic suppression regardless of which African country — Nigeria, Ghana, and Kenya are not interchangeable, but the safety net is not a source of setting detail either way', () => {
    const nigeria = culturalNegativeConstraints({ name: 'x', country: 'Nigeria' });
    const ghana = culturalNegativeConstraints({ name: 'x', country: 'Ghana' });
    const kenya = culturalNegativeConstraints({ name: 'x', country: 'Kenya' });
    expect(nigeria).toEqual(ghana);
    expect(ghana).toEqual(kenya);
  });
});

describe('shotPromptCompilerService — cultural fidelity wiring', () => {
  const baseShot = {
    cameraMovement: 'STATIC' as const,
    cameraSpeed: 'SLOW' as const,
    cameraAngle: 'EYE_LEVEL' as const,
    cameraRig: 'STATIC_TRIPOD' as const,
    framing: 'MEDIUM' as const,
    lens: '50mm',
    focalLength: '50mm',
    focusMode: 'FIXED' as const,
    depthOfField: 'MEDIUM' as const,
    movementPurpose: 'FOLLOW_CHARACTER' as const,
    composition: 'rule-of-thirds',
    durationSec: 6,
  };

  it('includes book-grounded African setting detail in the compiled prompt and suppresses stereotypes in the negative prompt', () => {
    const result = shotPromptCompilerService.compile({
      sourceTextSegment: 'Ada crossed the compound, greeting her uncle at the gate.',
      filmStyle: 'naturalistic drama',
      location: {
        name: 'the family compound',
        country: 'Nigeria',
        city: 'Lagos',
        culturalContext: 'a Yoruba family compound with corrugated iron roofing',
      },
      shot: baseShot,
    });
    expect(result.prompt).toMatch(/Lagos/);
    expect(result.prompt).toMatch(/Nigeria/);
    expect(result.negativePrompt).toMatch(/safari|tribal|stock/i);
  });

  it('includes book-grounded historical setting detail without introducing modern anachronisms', () => {
    const result = shotPromptCompilerService.compile({
      sourceTextSegment: 'The knight rode through the gate as the guards lowered their pikes.',
      filmStyle: 'epic historical drama',
      location: {
        name: 'the castle gate',
        region: 'medieval England',
        culturalContext: 'stone fortifications, no modern technology, torch-lit at night',
      },
      shot: baseShot,
    });
    expect(result.prompt).toMatch(/medieval England/);
    expect(result.prompt).toMatch(/no modern technology/);
  });

  it('does not add stereotype-suppression negatives for a setting with no country/region on record', () => {
    const result = shotPromptCompilerService.compile({
      sourceTextSegment: 'They sat in the kitchen, saying nothing.',
      shot: baseShot,
    });
    expect(result.negativePrompt).not.toMatch(/safari|tribal/i);
  });
});
