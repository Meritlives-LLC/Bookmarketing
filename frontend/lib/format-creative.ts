/**
 * Turn creative content (JSON from the API) into clean, professional copy
 * authors can read and paste — never raw JSON in the UI.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    // Array of primitives → bullet list
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return value.map((x) => `• ${String(x).trim()}`).join("\n");
    }
    // Array of objects (e.g. keywords)
    return value
      .map((item, i) => {
        if (isPlainObject(item)) {
          const lines = formatObject(item, depth + 1);
          return lines ? `${i + 1}. ${lines.replace(/\n/g, "\n   ")}` : "";
        }
        return `• ${formatValue(item, depth + 1)}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (isPlainObject(value)) {
    return formatObject(value, depth);
  }

  return String(value);
}

/** Prefer common marketing field order when present */
const PREFERRED_ORDER = [
  "headline",
  "subject",
  "title",
  "hook",
  "script",
  "body",
  "primaryText",
  "primary_text",
  "copy",
  "description",
  "cta",
  "callToAction",
  "call_to_action",
  "talkingPoints",
  "talking_points",
  "questions",
  "guide",
  "keywords",
  "hashtags",
  "caption",
  "notes",
];

function sortKeys(keys: string[]): string[] {
  const preferred = PREFERRED_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !PREFERRED_ORDER.includes(k)).sort();
  return [...preferred, ...rest];
}

function formatObject(obj: Record<string, unknown>, depth = 0): string {
  const keys = sortKeys(Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== ""));
  if (keys.length === 0) return "";

  // Single nested string field (e.g. { script: "..." }) → just the text
  if (keys.length === 1 && typeof obj[keys[0]] === "string") {
    const k = keys[0];
    const label = humanizeKey(k);
    // For pure body fields, skip redundant labels
    if (["script", "guide", "body", "copy", "text", "content"].includes(k.toLowerCase())) {
      return String(obj[k]).trim();
    }
    return `${label}\n${"─".repeat(Math.min(label.length, 40))}\n${String(obj[k]).trim()}`;
  }

  const blocks: string[] = [];
  for (const key of keys) {
    const formatted = formatValue(obj[key], depth + 1);
    if (!formatted) continue;
    const label = humanizeKey(key);
    if (formatted.includes("\n")) {
      blocks.push(`${label}\n${"─".repeat(Math.min(label.length, 40))}\n${formatted}`);
    } else {
      blocks.push(`${label}: ${formatted}`);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Full professional text for a creative's content field.
 */
export function formatCreativeContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") {
    const trimmed = content.trim();
    // If the API stored stringified JSON, try to parse and format
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return formatCreativeContent(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return formatValue(content).trim();
}

/**
 * Short preview for cards (first ~N characters, word-safe).
 */
export function formatCreativePreview(content: unknown, maxLen = 280): string {
  const full = formatCreativeContent(content);
  if (full.length <= maxLen) return full;
  const slice = full.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}