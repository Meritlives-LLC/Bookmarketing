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

  /**
   * Full ad creative suite: 5-of-core-assets, Google, Pinterest, Stories,
   * Amazon ad products, performance forecasts, formal framework.
   * Optional personaNotes from audit (real scraped personas only).
   */
  async generateAdSuite(book: Book, segment?: string, personaNotes?: string) {
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
        'Exactly 5 headlines, 5 bodies, 5 ctas, 5 visuals, 5 amazonAdProducts, 5 performanceForecasts.',
        'Headlines: under 12 words. Bodies: 2–4 sentences. CTAs: short and action-oriented.',
        'framework: name a real structure (PAS, AIDA, Hook-Story-Offer, etc.) and explain why it fits THIS book.',
        'Visuals: designer-ready; include a midjourney-style imagePrompt tied to this book’s mood/genre.',
        'Include Google RSA fields, Pinterest pin copy, and Instagram Stories frames.',
        'amazonAdProducts: cover Sponsored Products, Sponsored Brands, Sponsored Display, Amazon DSP, and one deal/promo product.',
        'performanceForecasts: honest ranges with explicit assumptions (not guaranteed results).',
        'Vary psychological angles (curiosity, benefit, social proof, urgency, emotion).',
      ],
      schema: `{
  "framework": { "name": string, "steps": string[], "whyItFitsThisBook": string },
  "headlines": [ { "text": string, "trigger": string, "platformFit": string } ],
  "bodies": [ { "text": string, "emotion": string, "painPoint": string } ],
  "ctas": [ { "text": string, "style": string } ],
  "visuals": [ {
    "type": "hero" | "carousel" | "story" | "pin" | "youtube" | "video",
    "title": string,
    "description": string,
    "colorPalette": string,
    "mood": string,
    "imagePrompt": string
  } ],
  "platforms": {
    "facebook": [ { "primaryText": string, "headline": string, "description": string, "cta": string } ],
    "instagram": [ { "caption": string, "headline": string, "cta": string, "hashtags": string[] } ],
    "instagramStories": [ { "frame": number, "text": string, "visual": string, "stickerCta": string } ],
    "tiktok": [ { "hook": string, "script": string, "cta": string, "onScreenText": string } ],
    "google": [ { "headline1": string, "headline2": string, "headline3": string, "description1": string, "description2": string, "path1": string, "path2": string } ],
    "pinterest": [ { "title": string, "description": string, "boardSuggestion": string, "imagePrompt": string } ],
    "amazon": [ { "headline": string, "keywords": string[], "notes": string } ],
    "email": [ { "subject": string, "preheader": string, "body": string, "cta": string } ]
  },
  "amazonAdProducts": [
    {
      "product": "Sponsored Products" | "Sponsored Brands" | "Sponsored Display" | "Amazon DSP" | "Kindle Countdown / Deal",
      "objective": string,
      "targetingNotes": string,
      "sampleCopy": string,
      "bidGuidance": string
    }
  ],
  "performanceForecasts": [
    {
      "channel": string,
      "metric": string,
      "rangeLow": number,
      "rangeHigh": number,
      "unit": string,
      "assumptions": string
    }
  ],
  "abTests": [ { "name": string, "control": string, "variantA": string, "variantB": string, "hypothesis": string } ]
}`,
    });

    type AdSuiteResult = {
      framework?: { name?: string; steps?: string[]; whyItFitsThisBook?: string };
      headlines: Array<{ text: string; trigger?: string; platformFit?: string }>;
      bodies: Array<{ text: string; emotion?: string; painPoint?: string }>;
      ctas: Array<{ text: string; style?: string }>;
      visuals: Array<{
        type?: string;
        title?: string;
        description?: string;
        colorPalette?: string;
        mood?: string;
        imagePrompt?: string;
      }>;
      platforms?: {
        facebook?: Array<Record<string, unknown>>;
        instagram?: Array<Record<string, unknown>>;
        instagramStories?: Array<Record<string, unknown>>;
        tiktok?: Array<Record<string, unknown>>;
        google?: Array<Record<string, unknown>>;
        pinterest?: Array<Record<string, unknown>>;
        amazon?: Array<Record<string, unknown>>;
        email?: Array<Record<string, unknown>>;
      };
      amazonAdProducts?: Array<Record<string, unknown>>;
      performanceForecasts?: Array<Record<string, unknown>>;
      abTests?: Array<Record<string, unknown>>;
    };

    return askJSON<AdSuiteResult>(prompt, {
      temperature: 0.85,
      maxTokens: 5500,
    });
  },

  /**
   * Deep TikTok / Reels / Stories script. Optional personaNotes from audit.
   */
  async generateTikTokScript(book: Book, personaNotes?: string) {
    const personaPart = personaNotes?.trim()
      ? `Ground hooks in these real audience notes (do not invent people):\n${personaNotes.trim().slice(0, 1000)}`
      : 'No live audience notes — use only THIS book’s title, genre, and description. No generic tropes.';

    const prompt = buildUserPrompt({
      task:
        'TASK: Write a production-ready 30–45s BookTok / IG Reels / Stories script specific to THIS book.',
      book,
      rules: [
        personaPart,
        'Reference concrete details from the book description — never generic "this book hits different".',
        'Include on-screen text and beat timing.',
        'Exactly 5 alternate hooks in hookVariants.',
        'storiesFrames: 3–5 frames usable as Instagram/Facebook Stories.',
        'No invented reviews, rankings, or awards.',
      ],
      schema: `{
  "durationSec": number,
  "hook": string,
  "hookVariants": string[],
  "beats": [ { "atSec": number, "spoken": string, "onScreenText": string, "visual": string } ],
  "cta": string,
  "sounds": string[],
  "hashtags": string[],
  "storiesFrames": [ { "frame": number, "text": string, "visual": string, "sticker": string } ]
}`,
    });

    return askJSON<{
      durationSec: number;
      hook: string;
      hookVariants: string[];
      beats: Array<{ atSec: number; spoken: string; onScreenText: string; visual: string }>;
      cta: string;
      sounds: string[];
      hashtags: string[];
      storiesFrames: Array<{ frame: number; text: string; visual: string; sticker: string }>;
    }>(prompt, { temperature: 0.85, maxTokens: 1400 });
  },

  /**
   * Full BookTube / trailer-style YouTube script. Not generic ad copy.
   * Optional personaNotes from audit.
   */
  async generateYoutubeScript(book: Book, personaNotes?: string) {
    const personaPart = personaNotes?.trim()
      ? `Audience research (must shape tone and angles; do not invent people):\n${personaNotes.trim().slice(0, 1200)}`
      : 'No live audience research — derive angles only from THIS book’s description.';

    const prompt = buildUserPrompt({
      task: 'TASK: Write a full BookTube / book-trailer style YouTube script for THIS specific book.',
      book,
      rules: [
        personaPart,
        'Open with a book-specific hook — not "hey guys welcome back".',
        'Reference concrete plot/theme details from the description without major spoilers.',
        'sections: timed blocks with spoken lines and broll suggestions.',
        'Exactly 5 titleVariants and 5 thumbnailText options grounded in the book.',
        'Do not invent awards, ranks, or review quotes.',
      ],
      schema: `{
  "title": string,
  "titleVariants": string[],
  "thumbnailText": string[],
  "hook": string,
  "sections": [ { "name": string, "startSec": number, "spoken": string, "broll": string } ],
  "cta": string,
  "description": string,
  "tags": string[],
  "endScreen": string
}`,
    });

    return askJSON<{
      title: string;
      titleVariants: string[];
      thumbnailText: string[];
      hook: string;
      sections: Array<{ name: string; startSec: number; spoken: string; broll: string }>;
      cta: string;
      description: string;
      tags: string[];
      endScreen: string;
    }>(prompt, { temperature: 0.75, maxTokens: 2000 });
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
        'flairSuggestion: short, realistic flair for the subreddit.',
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
        'platform is one of: instagram, tiktok, facebook, email, reddit, amazon, youtube, pinterest, google.',
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