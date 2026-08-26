/** Deterministic pre-generation evidence gate for book-derived scenes. */
export interface GroundingCharacter { name: string; aliases?: string[] | null; }
export interface GroundingLocation { name: string; country?: string | null; city?: string | null; region?: string | null; culturalContext?: string | null; }
export interface GroundingProp { name: string; }
export interface SceneGroundingInput {
  sourceText: string | null | undefined;
  /** Text immediately before this source range; never a whole-book lookup. */
  contextText?: string | null | undefined;
  characters: string[];
  location: string | null | undefined;
  props?: string[];
  action?: string | null | undefined;
  emotionalBeat?: string | null | undefined;
}
export interface GroundingValidationResult { ok: boolean; issues: string[]; resolvedCharacters: string[]; }

const STOP_WORDS = new Set(['a','an','and','are','as','at','be','by','for','from','he','her','his','in','is','it','its','of','on','or','she','that','the','their','them','they','this','to','was','were','with','woman','man','character','scene','shot','cinematic','camera']);
const EMOTION_OPPOSITES: Record<string, string[]> = { joyful: ['grief','grieving','sad','sorrow','afraid'], happy: ['grief','sad','afraid'], calm: ['panic','afraid','angry','furious'], peaceful: ['panic','violence','afraid'], angry: ['calm','peaceful','joyful'], afraid: ['calm','fearless','joyful'] };
function normalize(s: string): string { return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim(); }
function words(s: string): string[] { return normalize(s).split(' ').map((word) => word.replace(/(ing|ed|es|s)$/u, '')).filter((word) => word.length > 2 && !STOP_WORDS.has(word)); }
function phrases(character: GroundingCharacter): string[] { return [character.name, ...(character.aliases ?? [])].map(normalize).filter(Boolean); }
function phraseAppears(character: GroundingCharacter, text: string): boolean { const haystack = ` ${normalize(text)} `; return phrases(character).some((phrase) => haystack.includes(` ${phrase} `)); }

/** Resolve aliases directly, and pronouns only from a nearby unambiguous antecedent. */
function characterSupported(character: GroundingCharacter, source: string, context: string, all: GroundingCharacter[]): boolean {
  if (phraseAppears(character, source)) return true;
  if (!/\b(she|her|hers|he|him|his|they|them|their)\b/i.test(source)) return false;
  const candidates = all.filter((candidate) => phraseAppears(candidate, context.slice(-700)));
  return candidates.length === 1 && normalize(candidates[0].name) === normalize(character.name);
}
function evidenceSupports(claim: string, source: string, ignored: string[] = []): boolean {
  const ignoredWords = new Set(ignored.flatMap(words));
  const claimWords = [...new Set(words(claim).filter((word) => !ignoredWords.has(word)))];
  if (!claimWords.length) return false;
  const evidence = new Set(words(source));
  return claimWords.some((word) => evidence.has(word));
}

type EventMeaning = 'SUPPORTED' | 'CONTRADICTORY' | 'UNSUPPORTED';
/**
 * Small, explicit semantic vocabulary for the high-impact event changes a
 * visual planner is likely to make. It is intentionally narrow: unknown
 * verbs still use the lexical evidence fallback below, rather than claiming
 * that a brittle parser understands arbitrary prose.
 */
const EVENT_FAMILIES: Record<string, string[]> = {
  ENTER: ['enter', 'entered', 'entering', 'walk into', 'walked into', 'go into', 'went into', 'arrive', 'arrived'],
  LEAVE: ['leave', 'left', 'exit', 'exited', 'walk out', 'walked out', 'depart', 'departed'],
  FLEE: ['flee', 'fled', 'escape', 'escaped', 'run away', 'ran away'],
  ATTACK: ['attack', 'attacked', 'fight', 'fought', 'strike', 'struck', 'assault'],
  BURN: ['burn', 'burned', 'burnt', 'set fire', 'set ablaze', 'ignite', 'ignited'],
  TAKE: ['take', 'took', 'steal', 'stole', 'grab', 'grabbed'],
  LOSE: ['lose', 'lost', 'drop', 'dropped', 'give away', 'gave away'],
  RECEIVE: ['receive', 'received', 'accept', 'accepted', 'get', 'got'],
  SIT: ['sit', 'sat', 'seated'],
};
const CONTRADICTORY_FAMILIES: Record<string, string[]> = {
  ENTER: ['LEAVE'], LEAVE: ['ENTER'], FLEE: ['ATTACK', 'SIT'], ATTACK: ['FLEE'], TAKE: ['LOSE'], LOSE: ['TAKE', 'RECEIVE'], RECEIVE: ['LOSE'],
};
function eventFamilies(text: string): string[] {
  const normalized = normalize(text);
  return Object.entries(EVENT_FAMILIES).filter(([, variants]) => variants.some((variant) => normalized.includes(variant))).map(([family]) => family);
}
function validateEventMeaning(claim: string, source: string, ignored: string[]): EventMeaning {
  const sourceFamilies = eventFamilies(source);
  const claimFamilies = eventFamilies(claim);
  if (claimFamilies.some((family) => sourceFamilies.some((sourceFamily) => (CONTRADICTORY_FAMILIES[sourceFamily] ?? []).includes(family)))) return 'CONTRADICTORY';
  // A recognised visual action must be represented by the same semantic
  // family in the source. This catches shared-noun failures such as
  // "ran away from the burning house" -> "attacked the burning house".
  if (claimFamilies.length && !claimFamilies.every((family) => sourceFamilies.includes(family))) return 'UNSUPPORTED';
  if (claimFamilies.length) return 'SUPPORTED';
  return evidenceSupports(claim, source, ignored) ? 'SUPPORTED' : 'UNSUPPORTED';
}

export function canonicalCharacterName(value: string, knownCharacters: GroundingCharacter[]): string | null {
  const found = knownCharacters.find((character) => phrases(character).includes(normalize(value)));
  return found?.name ?? null;
}

export function validateSceneGrounding(scene: SceneGroundingInput, knownCharacters: GroundingCharacter[], knownLocations: GroundingLocation[], knownProps: GroundingProp[] = []): GroundingValidationResult {
  const issues: string[] = [];
  const sourceText = scene.sourceText?.trim() ?? '';
  const resolvedCharacters: string[] = [];
  if (!sourceText) return { ok: false, issues: ['Scene has no source text — cannot be traced to book content.'], resolvedCharacters };
  for (const requested of scene.characters) {
    if (!requested.trim()) continue;
    const canonical = canonicalCharacterName(requested, knownCharacters);
    if (!canonical) { issues.push(`Character "${requested}" is not in this project's character bible (not extracted from the book).`); continue; }
    const character = knownCharacters.find((item) => item.name === canonical)!;
    if (!characterSupported(character, sourceText, scene.contextText?.trim() ?? '', knownCharacters)) issues.push(`Character "${canonical}" is not supported by this scene excerpt or an unambiguous nearby pronoun antecedent.`);
    else resolvedCharacters.push(canonical);
  }
  if (scene.location?.trim()) {
    const location = knownLocations.find((item) => normalize(item.name) === normalize(scene.location!));
    if (!location) issues.push(`Location "${scene.location}" is not in this project's location bible (not extracted from the book).`);
    else if (!words(location.name).some((word) => words(`${sourceText} ${scene.contextText ?? ''}`).includes(word))) issues.push(`Location "${scene.location}" is not supported by this scene excerpt or its immediate context.`);
  }
  for (const prop of scene.props ?? []) {
    if (!prop.trim()) continue;
    if (!knownProps.some((item) => normalize(item.name) === normalize(prop)) || !evidenceSupports(prop, sourceText)) issues.push(`Object "${prop}" is not supported by this scene's source excerpt.`);
  }
  if (!scene.action?.trim()) issues.push('Scene has no structured action/event summary.');
  else {
    const meaning = validateEventMeaning(scene.action, sourceText, [...knownCharacters.flatMap(phrases), scene.location ?? '']);
    if (meaning === 'CONTRADICTORY') issues.push(`Action/event "${scene.action}" contradicts the source event in this scene excerpt.`);
    else if (meaning === 'UNSUPPORTED') issues.push(`Action/event "${scene.action}" is not supported by this scene's source excerpt.`);
  }
  if (scene.emotionalBeat?.trim()) {
    const emotion = normalize(scene.emotionalBeat);
    if (Object.entries(EMOTION_OPPOSITES).some(([word, opposites]) => emotion.includes(word) && opposites.some((opposite) => normalize(sourceText).includes(opposite)))) issues.push(`Emotional context "${scene.emotionalBeat}" contradicts this scene's source excerpt.`);
  }
  return { ok: issues.length === 0, issues, resolvedCharacters };
}
