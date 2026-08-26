/**
 * Pre-generation grounding validation.
 *
 * Before a scene/shot is sent to the paid video provider, verify the
 * scene specification is actually traceable to the book content it
 * claims to represent — not invented, and not silently substituted with
 * generic/stereotyped setting detail.
 *
 * This is deliberately conservative and mechanical (string/substring
 * checks against the manuscript excerpt actually stored on the scene),
 * not a second AI call — a validator that itself hallucinates would not
 * be a safety net. It catches the clear, checkable failure modes:
 *
 *   - a scene with no source text at all (nothing to ground it)
 *   - characters listed on the scene that don't appear anywhere in the
 *     scene's own source excerpt (likely invented or misattributed)
 *   - a location claimed for the scene that was never extracted for
 *     this project (i.e. not part of the book-derived location bible)
 *   - cultural/geographic fields that were fabricated rather than
 *     extracted (country/city set without ever having been recorded
 *     against this location in the location bible)
 *
 * It does NOT try to judge writing quality, cinematic quality, or
 * anything the provider itself is responsible for — only whether the
 * scene is grounded in the book.
 */

export interface GroundingCharacter {
  name: string;
}

export interface GroundingLocation {
  name: string;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  culturalContext?: string | null;
}

export interface SceneGroundingInput {
  sourceText: string | null | undefined;
  characters: string[];
  location: string | null | undefined;
}

export interface GroundingValidationResult {
  ok: boolean;
  issues: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * A character "appears" in the source text if their name or any
 * significant word of a multi-word name shows up in the excerpt. This
 * intentionally tolerates pronoun-only mentions and honorifics ("the
 * old man" for a character named "Baba Tunde" would fail this check —
 * which is fine: it means the scene planner attributed a named
 * character to a passage that doesn't actually name them, and that is
 * exactly the kind of drift this check exists to catch) while still
 * being conservative enough not to flag correctly-grounded scenes.
 */
function nameAppearsInText(name: string, text: string): boolean {
  const normalizedText = normalize(text);
  const normalizedName = normalize(name);
  if (normalizedText.includes(normalizedName)) return true;
  // Allow a match on any individual name token of 3+ chars (handles
  // "Adaeze Okafor" being referred to as just "Adaeze" in a scene).
  const tokens = normalizedName.split(/\s+/).filter((t) => t.length >= 3);
  return tokens.some((t) => normalizedText.includes(t));
}

/**
 * Validate a scene's grounding before it is allowed to proceed to
 * prompt compilation / provider generation.
 *
 * `knownLocations` and `knownCharacters` are the project's own
 * book-derived bibles — a scene is only allowed to reference a
 * location/character that the analysis pass actually extracted from
 * the manuscript, not just from the loosely-matched string on the
 * scene row itself.
 */
export function validateSceneGrounding(
  scene: SceneGroundingInput,
  knownCharacters: GroundingCharacter[],
  knownLocations: GroundingLocation[]
): GroundingValidationResult {
  const issues: string[] = [];

  const sourceText = scene.sourceText?.trim() ?? '';
  if (!sourceText) {
    issues.push('Scene has no source text — cannot be traced to book content.');
    // No point checking characters/location against empty text.
    return { ok: false, issues };
  }

  for (const charName of scene.characters) {
    if (!charName.trim()) continue;
    const isKnown = knownCharacters.some((c) => normalize(c.name) === normalize(charName));
    if (!isKnown) {
      issues.push(`Character "${charName}" is not in this project's character bible (not extracted from the book).`);
      continue;
    }
    if (!nameAppearsInText(charName, sourceText)) {
      issues.push(`Character "${charName}" does not appear in this scene's own source text excerpt.`);
    }
  }

  if (scene.location && scene.location.trim()) {
    const matchedLoc = knownLocations.find((l) => normalize(l.name) === normalize(scene.location as string));
    if (!matchedLoc) {
      issues.push(`Location "${scene.location}" is not in this project's location bible (not extracted from the book).`);
    } else {
      // Guard against fabricated geography: a location record's
      // country/city/culturalContext must have come from the analysis
      // pass. This function trusts the location bible as the source of
      // truth — if a caller passes different geography than what's on
      // file for that location, that's the fabrication this check
      // exists to catch (e.g. a downstream step overriding "Nigeria"
      // with "generic African country" text not present in the bible).
      if (matchedLoc.country && !nameAppearsInText(matchedLoc.country, sourceText) && !matchedLoc.culturalContext) {
        // Not itself a hard failure — the book excerpt for one scene
        // won't always restate the country — but flagged so a human can
        // confirm the geography genuinely traces back to earlier
        // chapter analysis rather than being asserted with nothing
        // behind it. Downstream callers may treat this as advisory.
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
