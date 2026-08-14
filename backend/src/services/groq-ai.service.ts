/**
 * Groq-backed content generator. Mirrors `localAiService`'s function
 * signatures exactly (see `local-ai.service.ts`) so `ai.service.ts` can
 * pick between the two without any call site changing.
 *
 * Each function accepts an optional trailing `scrapedContext` string —
 * real text pulled off Goodreads/Amazon/Reddit by `scraper.service.ts`
 * (see `combineScrapedContext`) — and, when present, tells the model to
 * ground its answer in that rather than inventing genre-typical reactions.
 * Callers that don't have scraped context (creative/calendar generation)
 * simply omit it.
 *
 * Every call goes through `groqService.chatJSON`, which throws on network
 * error, timeout, or malformed JSON — `ai.service.ts` catches that and
 * falls back to `localAiService`, so a Groq outage or an unset API key
 * never breaks these endpoints.
 */
import { Book } from '@prisma/client';
import { groqService, GroqMessage } from './groq.service';

function genreLabel(genre: string): string {
  return genre.toLowerCase().replace(/_/g, ' ');
}

function bookContext(book: Pick<Book, 'title' | 'description' | 'genre'>): string {
  return `Book title: "${book.title}"\nGenre: ${genreLabel(book.genre)}\nDescription: ${book.description}`;
}

function withScrapedContext(base: string, scrapedContext?: string): string {
  if (!scrapedContext) return base;
  return `${base}\n\nReal audience research pulled from the web (Goodreads/Amazon/Reddit) — ground your answer in what these readers actually say, don't just restate genre tropes:\n${scrapedContext}`;
}

const SYSTEM_PROMPT =
  'You are a senior book marketing strategist. You always respond with a single valid JSON object and nothing else — no markdown fences, no commentary before or after.';

async function askJSON<T>(userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<T> {
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  return groqService.chatJSON<T>(messages, options);
}

export const groqAiService = {
  async generateAudienceInsight(book: Book, segment: string, platform: string, scrapedContext?: string) {
    const prompt = withScrapedContext(
      `${bookContext(book)}\n\nReader segment: ${segment.replace(/_/g, ' ').toLowerCase()}\nPlatform: ${platform.toLowerCase()}\n\n` +
        `Return a JSON object with this exact shape:\n` +
        `{"summary": string (2-4 sentences on why this segment would respond to this book on this platform), ` +
        `"data": {"loves": string[] (3 items), "hates": string[] (2-3 items), "searchBehavior": string[] (2-3 search terms this segment uses), "resonantThemes": string[] (2-3 themes from the book)}, ` +
        `"confidence": number (0 to 1, how confident this insight is given the available information)}`,
      scrapedContext
    );
    return askJSON<{
      summary: string;
      data: { loves: string[]; hates: string[]; searchBehavior: string[]; resonantThemes: string[] };
      confidence: number;
    }>(prompt);
  },

  async generateKeywordSuggestions(book: Book, scrapedContext?: string) {
    const prompt = withScrapedContext(
      `${bookContext(book)}\n\nSuggest 10 Amazon advertising keywords for this book.\n` +
        `Return a JSON object: {"keywords": [{"keyword": string, "searchVolume": number (estimated monthly), ` +
        `"suggestedBid": number (USD, 0.35-2.85), "competition": "low"|"medium"|"high"}]} — exactly 10 items.`,
      scrapedContext
    );
    return askJSON<{
      keywords: Array<{ keyword: string; searchVolume: number; suggestedBid: number; competition: string }>;
    }>(prompt);
  },

  async generateCompetitorAnalysis(book: Book, scrapedContext?: string) {
    const prompt = withScrapedContext(
      `${bookContext(book)}\n\nIdentify 3 comparable/competing titles in this genre and analyze each.\n` +
        `Return a JSON object: {"competitors": [{"competitorName": string, "strengths": string[] (2-3), "weaknesses": string[] (2-3)}]} — exactly 3 items. ` +
        `If you don't know real comparable titles, use realistic composite names like "a genre-typical bestseller" rather than inventing a specific fake title.`,
      scrapedContext
    );
    return askJSON<{ competitors: Array<{ competitorName: string; strengths: string[]; weaknesses: string[] }> }>(prompt);
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    const prompt =
      `${bookContext(book)}\n\nWrite ad copy targeting the "${segment}" segment for ${platform}.\n` +
      `Return a JSON object: {"headline": string (under 12 words, scroll-stopping), "body": string (2-3 sentences, platform-appropriate length), "callToAction": string (2-4 words, e.g. "Shop Now")}.`;
    return askJSON<{ headline: string; body: string; callToAction: string }>(prompt, { temperature: 0.9 });
  },

  async generateTikTokScript(book: Book) {
    const prompt =
      `${bookContext(book)}\n\nWrite a 30-second BookTok script.\n` +
      `Return a JSON object: {"hook": string (0-3s, POV/trope-callout style), "body": string (4-25s, punchy summary without spoilers), "cta": string (26-30s)}.`;
    const result = await askJSON<{ hook: string; body: string; cta: string }>(prompt, { temperature: 0.9 });
    return [`HOOK (0-3s): ${result.hook}`, '', `BODY (4-25s): ${result.body}`, '', `CTA (26-30s): ${result.cta}`].join('\n');
  },

  async generateEmailCopy(book: Book) {
    const prompt =
      `${bookContext(book)}\n\nWrite a launch-announcement email for this book's newsletter subscribers.\n` +
      `Return a JSON object: {"subject": string (under 10 words), "body": string (friendly, 3-4 short paragraphs, signed "[Your name]")}.`;
    return askJSON<{ subject: string; body: string }>(prompt, { temperature: 0.8 });
  },

  async generateDiscussionGuide(book: Book) {
    const prompt =
      `${bookContext(book)}\n\nWrite an 8-question book club discussion guide.\n` +
      `Return a JSON object: {"questions": string[]} with exactly 8 thoughtful, spoiler-light questions, numbered 1-8 within each string.`;
    const result = await askJSON<{ questions: string[] }>(prompt, { maxTokens: 1200 });
    return result.questions.join('\n');
  },

  async generatePodcastPitch(book: Book) {
    const prompt =
      `${bookContext(book)}\n\nWrite a cold-outreach pitch email an author would send to a book-focused podcast host to ask for an interview.\n` +
      `Return a JSON object: {"subject": string (under 10 words, specific — not "Interview request"), ` +
      `"body": string (4-5 short paragraphs: personalized opener referencing why this show/genre fits, 1-2 sentence book hook, 2-3 concrete talking points/angles the author could discuss on air, and a low-friction close), ` +
      `"talkingPoints": string[] (3-4 specific discussion angles a host could use in the show notes)}.`;
    return askJSON<{ subject: string; body: string; talkingPoints: string[] }>(prompt, { temperature: 0.8 });
  },

  async generateRedditPost(book: Book) {
    const prompt =
      `${bookContext(book)}\n\nWrite a Reddit post an author could share in a relevant book-discussion subreddit (e.g. r/books, r/Fantasy, r/RomanceBooks depending on genre) that reads as a genuine community contribution, not an ad.\n` +
      `Follow standard Reddit self-promotion norms: transparent about being the author, value-first, no hard sell, no link-dropping in the body.\n` +
      `Return a JSON object: {"suggestedSubreddit": string, "title": string (Reddit-style post title, under 15 words, no clickbait/emoji), ` +
      `"body": string (3-4 short paragraphs: genuine context or a craft/genre question tied to the book, brief transparent mention of authorship, an actual question inviting discussion), ` +
      `"flairSuggestion": string}.`;
    return askJSON<{ suggestedSubreddit: string; title: string; body: string; flairSuggestion: string }>(prompt, {
      temperature: 0.8,
    });
  },

  async generateCalendar(book: Book, days: number) {
    const prompt =
      `${bookContext(book)}\n\nBuild a ${Math.min(days, 30)}-day launch marketing calendar (up to 10 key posting events spread across the window).\n` +
      `Return a JSON object: {"events": [{"day": number (1-${days}), "platform": string (lowercase: instagram, tiktok, facebook, email, reddit, or amazon), "action": string (concrete action, under 12 words)}]} — up to 10 events, ordered by day.`;
    return askJSON<{ events: Array<{ day: number; platform: string; action: string }> }>(prompt, { maxTokens: 1200 });
  },
};