/**
 * Groq-backed content generator with production prompt engineering.
 *
 * Design goals:
 *  - Strict JSON-only output (json_object mode + system rules)
 *  - Grounding: prefer scraped reader language; never invent named people
 *  - Token control: scrape context is truncated before the prompt
 *  - Task-specific temperature (analytical low, creative higher)
 *  - Explicit confidence rubric so scores mean something
 *
 * Signatures match localAiService so ai.service.ts can fall back safely.
 */
import { Book } from '@prisma/client';
import { groqService, GroqMessage } from './groq.service';

/** Keep scrape payload inside a safe budget (~3–4k chars ≈ few hundred tokens). */
const MAX_SCRAPE_CHARS = 3500;

function genreLabel(genre: string): string {
  return genre.toLowerCase().replace(/_/g, ' ');
}

function segmentLabel(segment: string): string {
  return segment.replace(/_/g, ' ').toLowerCase();
}

function bookContext(book: Pick<Book, 'title' | 'description' | 'genre'>): string {
  const desc = (book.description || '').trim().slice(0, 900);
  return [
    `BOOK`,
    `- Title: "${book.title}"`,
    `- Genre: ${genreLabel(book.genre)}`,
    `- Description: ${desc || '(none provided)'}`,
  ].join('\n');
}

function clipScrape(scrapedContext?: string): string {
  if (!scrapedContext?.trim()) return '';
  const t = scrapedContext.trim();
  if (t.length <= MAX_SCRAPE_CHARS) return t;
  return `${t.slice(0, MAX_SCRAPE_CHARS)}\n…[truncated]`;
}

/**
 * Build user message: instructions first, book, optional research block, schema last
 * (models attend strongly to both ends of the prompt).
 */
function buildUserPrompt(parts: {
  task: string;
  book: Pick<Book, 'title' | 'description' | 'genre'>;
  extra?: string;
  scrapedContext?: string;
  schema: string;
  rules?: string[];
}): string {
  const scrape = clipScrape(parts.scrapedContext);
  const rules = [
    'Respond with one valid JSON object only. No markdown fences. No prose outside JSON.',
    ...(parts.rules ?? []),
  ];

  const blocks = [
    parts.task,
    bookContext(parts.book),
    parts.extra?.trim() || '',
    scrape
      ? `RESEARCH (live web scrape — treat as primary evidence; quote or paraphrase only what is here):\n${scrape}`
      : `RESEARCH: none available. Infer carefully from the book description only. Do not invent named reviewers, ratings, or platform metrics.`,
    `RULES:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    `OUTPUT SCHEMA (match keys exactly):\n${parts.schema}`,
  ];
  return blocks.filter(Boolean).join('\n\n');
}

const SYSTEM_PROMPT = [
  'You are a senior book-marketing strategist and audience researcher.',
  'You write precise, actionable insights for authors and publishers.',
  'Hard constraints:',
  '- Output a single JSON object only (no markdown, no commentary).',
  '- Prefer evidence from RESEARCH when present; never invent named people, quotes, ISBNs, or review counts.',
  '- If RESEARCH is empty, lower confidence and avoid false specificity.',
  '- Keep strings concise; no filler marketing fluff.',
].join(' ');

async function askJSON<T>(
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  return groqService.chatJSON<T>(messages, options);
}

export const groqAiService = {
  async generateAudienceInsight(
    book: Book,
    segment: string,
    platform: string,
    scrapedContext?: string
  ) {
    const hasResearch = Boolean(clipScrape(scrapedContext));
    const prompt = buildUserPrompt({
      task:
        `TASK: Produce an audience insight for the "${segmentLabel(segment)}" segment on ${platform.toLowerCase()}. ` +
        `Explain why this segment would (or would not) engage with this book on this platform.`,
      book,
      scrapedContext,
      rules: [
        'When RESEARCH lists individual readers, you may echo up to 5 into sampleReaders (name, source, quote) — copy from RESEARCH only.',
        'If RESEARCH has no people, set sampleReaders to [].',
        'loves / hates / searchBehavior / resonantThemes must be specific to THIS book + segment, not generic genre tips.',
        hasResearch
          ? 'confidence: use 0.55–0.9 when research supports the claim; higher only with clear matching quotes/themes.'
          : 'confidence: use 0.25–0.5 (no research). Never exceed 0.55 without research.',
        'summary: 2–4 sentences; weave in reader language from RESEARCH when available.',
      ],
      schema: `{
  "summary": string,
  "data": {
    "loves": string[3],
    "hates": string[2-3],
    "searchBehavior": string[2-3],
    "resonantThemes": string[2-3],
    "sampleReaders": [{"name": string, "source": string, "quote": string}]
  },
  "confidence": number
}`,
    });

    return askJSON<{
      summary: string;
      data: {
        loves: string[];
        hates: string[];
        searchBehavior: string[];
        resonantThemes: string[];
        sampleReaders?: Array<{ name: string; source: string; quote: string }>;
      };
      confidence: number;
    }>(prompt, { temperature: 0.35, maxTokens: 1400 });
  },

  async generateKeywordSuggestions(book: Book, scrapedContext?: string) {
    const prompt = buildUserPrompt({
      task:
        'TASK: Suggest Amazon advertising keywords for this book (Sponsored Products style). ' +
        'Mix short-tail commercial terms and long-tail intent phrases.',
      book,
      scrapedContext,
      rules: [
        'Exactly 10 keywords.',
        'Prefer phrases readers actually use in RESEARCH when present (search-like language).',
        'Avoid the exact book title as a keyword more than once.',
        'searchVolume is a rough monthly estimate; suggestedBid is USD between 0.35 and 2.85.',
        'competition must be "low", "medium", or "high".',
      ],
      schema: `{
  "keywords": [
    {"keyword": string, "searchVolume": number, "suggestedBid": number, "competition": "low"|"medium"|"high"}
  ]
}`,
    });

    return askJSON<{
      keywords: Array<{
        keyword: string;
        searchVolume: number;
        suggestedBid: number;
        competition: string;
      }>;
    }>(prompt, { temperature: 0.4, maxTokens: 900 });
  },

  async generateCompetitorAnalysis(book: Book, scrapedContext?: string) {
    const prompt = buildUserPrompt({
      task:
        'TASK: Identify 3 comparable titles an author might compete with or position against. ' +
        'Analyze strengths and weaknesses relative to THIS book.',
      book,
      scrapedContext,
      rules: [
        'Exactly 3 competitors.',
        'Prefer real, well-known titles when confident; otherwise use labels like "a midlist [genre] bestseller" — do not invent obscure fake titles.',
        'strengths/weaknesses: 2–3 short bullets each, actionable for marketing positioning.',
        'If RESEARCH mentions comps or reader comparisons, prioritize those.',
      ],
      schema: `{
  "competitors": [
    {"competitorName": string, "strengths": string[], "weaknesses": string[]}
  ]
}`,
    });

    return askJSON<{
      competitors: Array<{ competitorName: string; strengths: string[]; weaknesses: string[] }>;
    }>(prompt, { temperature: 0.4, maxTokens: 1000 });
  },

    async generateAdSuite(
    book: Book,
    segment?: string,
    personaNotes?: string
  ) {
    const segmentPart = segment
      ? `Primary reader segment: "${segmentLabel(segment)}".`
      : 'Primary reader segment: general readers of this genre.';
    const personaPart = personaNotes?.trim()
      ? `Use these real audience notes (do not invent named reviewers):\n${personaNotes.trim().slice(0, 1200)}`
      : 'No persona scrape notes available — infer carefully from the book only.';

    const prompt = buildUserPrompt({
      task: `TASK: Act as a senior book-marketing creative director. Produce a complete ad creative suite for paid and organic channels. ${segmentPart}`,
      book,
      rules: [
        personaPart,
        'All copy must be specific to THIS book — no generic filler.',
        'No spoilers of major plot twists. Do not invent awards, ranks, or review counts.',
        'Headlines: under 12 words each. Bodies: 2–4 sentences. CTAs: short and action-oriented.',
        'Visuals: descriptive enough for a designer or image model; include a midjourney-style imagePrompt.',
        'Platform packs must be ready to paste into ads managers (platform-appropriate length).',
        'Vary psychological angles across headlines (curiosity, benefit, social proof, urgency, emotion).',
      ],
      schema: `{
  "headlines": [ { "text": string, "trigger": string, "platformFit": string } ],
  "bodies": [ { "text": string, "emotion": string, "painPoint": string } ],
  "ctas": [ { "text": string, "style": string } ],
  "visuals": [ {
    "type": "hero" | "carousel" | "video",
    "title": string,
    "description": string,
    "colorPalette": string,
    "mood": string,
    "imagePrompt": string
  } ],
  "platforms": {
    "facebook": [ { "primaryText": string, "headline": string, "description": string, "cta": string } ],
    "instagram": [ { "caption": string, "headline": string, "cta": string, "hashtags": string[] } ],
    "tiktok": [ { "hook": string, "script": string, "cta": string, "onScreenText": string } ],
    "amazon": [ { "headline": string, "keywords": string[], "notes": string } ],
    "email": [ { "subject": string, "preheader": string, "body": string, "cta": string } ]
  },
  "abTests": [ { "name": string, "control": string, "variantA": string, "variantB": string, "hypothesis": string } ]
}`,
    });

    return askJSON</* same shape as schema */>(prompt, {
      temperature: 0.85,
      maxTokens: 4500,
    });
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    const prompt = buildUserPrompt({
      task: `TASK: Write paid-social ad copy for the "${segmentLabel(segment)}" segment on ${platform.toLowerCase()}.`,
      book,
      rules: [
        'headline: under 12 words, concrete, not clickbait.',
        'body: 2–3 sentences, platform-appropriate length, no spoilers.',
        'callToAction: 2–4 words.',
        'Do not invent awards, bestseller ranks, or review counts.',
      ],
      schema: `{
  "headline": string,
  "body": string,
  "callToAction": string
}`,
    });
    return askJSON<{ headline: string; body: string; callToAction: string }>(prompt, {
      temperature: 0.85,
      maxTokens: 500,
    });
  },

  async generateTikTokScript(book: Book) {
    const prompt = buildUserPrompt({
      task: 'TASK: Write a 30-second BookTok-style spoken script (no hashtags in body).',
      book,
      rules: [
        'hook: first 0–3 seconds — pattern interrupt or trope callout.',
        'body: 4–25s — tension/stakes without spoilers.',
        'cta: 26–30s — soft watch/read prompt.',
      ],
      schema: `{
  "hook": string,
  "body": string,
  "cta": string
}`,
    });
    const result = await askJSON<{ hook: string; body: string; cta: string }>(prompt, {
      temperature: 0.9,
      maxTokens: 600,
    });
    return [
      `HOOK (0-3s): ${result.hook}`,
      '',
      `BODY (4-25s): ${result.body}`,
      '',
      `CTA (26-30s): ${result.cta}`,
    ].join('\n');
  },

  async generateEmailCopy(book: Book) {
    const prompt = buildUserPrompt({
      task: 'TASK: Write a launch-announcement email for existing newsletter subscribers.',
      book,
      rules: [
        'subject: under 10 words, specific to this book.',
        'body: 3–4 short paragraphs, warm tone, sign off as "[Your name]".',
        'No invented bestseller claims.',
      ],
      schema: `{
  "subject": string,
  "body": string
}`,
    });
    return askJSON<{ subject: string; body: string }>(prompt, { temperature: 0.75, maxTokens: 800 });
  },

  async generateDiscussionGuide(book: Book) {
    const prompt = buildUserPrompt({
      task: 'TASK: Write an 8-question book-club discussion guide.',
      book,
      rules: [
        'Exactly 8 questions.',
        'Spoiler-light; suitable for mixed progress readers.',
        'Prefix each string with "1." … "8.".',
      ],
      schema: `{
  "questions": string[]
}`,
    });
    const result = await askJSON<{ questions: string[] }>(prompt, {
      temperature: 0.55,
      maxTokens: 1200,
    });
    return result.questions.join('\n');
  },

  async generatePodcastPitch(book: Book) {
    const prompt = buildUserPrompt({
      task: 'TASK: Write a cold-outreach pitch email from the author to a book-focused podcast host.',
      book,
      rules: [
        'subject: specific, under 10 words — not "Interview request".',
        'body: 4–5 short paragraphs (fit + hook + angles + soft close).',
        'talkingPoints: 3–4 concrete on-air angles.',
      ],
      schema: `{
  "subject": string,
  "body": string,
  "talkingPoints": string[]
}`,
    });
    return askJSON<{ subject: string; body: string; talkingPoints: string[] }>(prompt, {
      temperature: 0.75,
      maxTokens: 1000,
    });
  },

  async generateRedditPost(book: Book) {
    const prompt = buildUserPrompt({
      task:
        'TASK: Draft a Reddit post suitable for a book-discussion subreddit. ' +
        'It must read as a community contribution, not an ad.',
      book,
      rules: [
        'Transparent authorship, value-first, no hard sell, no link in the body.',
        'title: under 15 words, no emoji/clickbait.',
        'body: 3–4 short paragraphs ending in a real discussion question.',
      ],
      schema: `{
  "suggestedSubreddit": string,
  "title": string,
  "body": string,
  "flairSuggestion": string
}`,
    });
    return askJSON<{
      suggestedSubreddit: string;
      title: string;
      body: string;
      flairSuggestion: string;
    }>(prompt, { temperature: 0.75, maxTokens: 900 });
  },

  async generateCalendar(book: Book, days: number) {
    const window = Math.min(Math.max(days, 1), 30);
    const prompt = buildUserPrompt({
      task: `TASK: Build a ${window}-day launch marketing calendar with up to 10 key actions.`,
      book,
      rules: [
        `day is an integer from 1 to ${window}.`,
        'platform is one of: instagram, tiktok, facebook, email, reddit, amazon.',
        'action is concrete and under 12 words.',
        'Order events by day ascending; max 10 events.',
      ],
      schema: `{
  "events": [
    {"day": number, "platform": string, "action": string}
  ]
}`,
    });
    return askJSON<{ events: Array<{ day: number; platform: string; action: string }> }>(prompt, {
      temperature: 0.5,
      maxTokens: 1200,
    });
  },
};