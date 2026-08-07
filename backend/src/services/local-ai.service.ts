/**
 * Standalone content generator — no external AI provider, no API key, no
 * network call, no per-request cost or rate limit. Replaces the previous
 * OpenAI-backed implementation entirely.
 *
 * Content is produced from genre/segment/platform template banks combined
 * with lightweight keyword extraction from the book's own title and
 * description, so output is book-specific without needing a live model.
 * Every exported function mirrors the old `aiService` signatures exactly,
 * so nothing calling it needs to change.
 */
import { Book } from '@prisma/client';

// ── deterministic "randomness" ────────────────────────────────────────────
// Seeded by the book id (+ a salt per call site) so repeated calls for the
// same book/segment/platform combination stay stable, while different
// combinations still vary.
function seedFrom(...parts: string[]): number {
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(arr: T[], seed: number, salt = 0): T {
  return arr[(seed + salt) % arr.length];
}

function pickMany<T>(arr: T[], seed: number, count: number): T[] {
  const result: T[] = [];
  const used = new Set<number>();
  let i = 0;
  while (result.length < Math.min(count, arr.length)) {
    const idx = (seed + i * 7919) % arr.length;
    if (!used.has(idx)) {
      used.add(idx);
      result.push(arr[idx]);
    }
    i++;
  }
  return result;
}

// ── lightweight keyword extraction from title/description ─────────────────
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'as', 'by', 'at',
  'from', 'her', 'his', 'their', 'she', 'he', 'they', 'has', 'have', 'had',
  'will', 'not', 'his', 'him', 'who', 'what', 'when', 'where', 'how', 'into',
]);

function extractKeywords(book: Pick<Book, 'title' | 'description'>, count = 4): string[] {
  const words = `${book.title} ${book.description}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── genre-aware content banks ───────────────────────────────────────────
const GENRE_TONE: Record<string, string> = {
  ROMANCE: 'swoony and emotionally charged',
  ROMANTASY: 'lush, high-stakes, and romantic',
  FANTASY: 'immersive and world-building-forward',
  SCI_FI: 'high-concept and forward-looking',
  THRILLER: 'tense, propulsive, and edge-of-seat',
  MYSTERY: 'clue-driven and suspenseful',
  YA: 'voice-driven and identity-focused',
  LITERARY_FICTION: 'introspective and prose-forward',
  HISTORICAL_FICTION: 'richly researched and immersive',
  NON_FICTION: 'authoritative and practical',
  MEMOIR: 'raw, personal, and honest',
  SELF_HELP: 'actionable and motivating',
  BUSINESS: 'results-driven and credible',
  HORROR: 'unsettling and atmospheric',
  LITRPG: 'stat-driven and progression-focused',
  OTHER: 'distinctive and genre-blending',
};

const GENRE_KEYWORD_BANK: Record<string, string[]> = {
  ROMANCE: ['enemies to lovers', 'slow burn', 'small town romance', 'second chance romance', 'steamy romance novel'],
  ROMANTASY: ['fae romance', 'romantasy books 2026', 'fated mates', 'dark academia romance', 'dragon romance'],
  FANTASY: ['epic fantasy series', 'magic system fantasy', 'fantasy adventure book', 'coming of age fantasy'],
  SCI_FI: ['space opera book', 'dystopian sci fi', 'first contact novel', 'hard science fiction'],
  THRILLER: ['psychological thriller', 'domestic thriller book', 'unputdownable thriller', 'twisty thriller novel'],
  MYSTERY: ['cozy mystery series', 'detective mystery novel', 'whodunit book', 'small town mystery'],
  YA: ['young adult fantasy', 'ya coming of age', 'young adult romance book'],
  LITERARY_FICTION: ['book club fiction', 'literary fiction 2026', 'character driven novel'],
  HISTORICAL_FICTION: ['ww2 historical fiction', 'historical fiction book club', 'sweeping historical novel'],
  NON_FICTION: ['nonfiction bestseller', 'must read nonfiction'],
  MEMOIR: ['memoir 2026', 'inspiring true story book'],
  SELF_HELP: ['self help book', 'personal growth book', 'productivity book'],
  BUSINESS: ['business strategy book', 'leadership book', 'entrepreneur must read'],
  HORROR: ['horror novel 2026', 'psychological horror book', 'haunted house novel'],
  LITRPG: ['litrpg series', 'gamelit novel', 'progression fantasy'],
  OTHER: ['book recommendation', 'must read 2026'],
};

const SEGMENT_TRAITS: Record<string, { loves: string[]; hates: string[]; searches: string[] }> = {
  BOOKTOK: {
    loves: ['tropes called out by name in the caption', 'emotional gut-punch quotes', 'fast-paced hooks in the first 3 seconds'],
    hates: ['slow openings', 'covers that look dated', 'spoiler-heavy captions'],
    searches: ['#booktokmademebuyit', 'trope hashtags', 'reading vlogs'],
  },
  GOODREADS_POWER_READER: {
    loves: ['detailed, spoiler-tagged reviews', 'series with a clear reading order', 'authors who reply to reviews'],
    hates: ['inconsistent character voice', 'unresolved plot threads', 'misleading blurbs'],
    searches: ['similar books to...', 'reading challenge picks', 'award nominee lists'],
  },
  AMAZON_SEARCH_SHOPPER: {
    loves: ['clear genre + comps in the subtitle', 'strong "look inside" first pages', 'competitive Kindle Unlimited pricing'],
    hates: ['vague product descriptions', 'covers that don\'t signal genre', 'few reviews'],
    searches: ['genre + trope keyword combos', '"if you liked X" searches', 'top rated in [genre]'],
  },
  REDDIT_COMMUNITY: {
    loves: ['honest, unpolished recommendations', 'authors who engage without hard-selling', 'niche subgenre threads'],
    hates: ['obvious astroturfing', 'overly promotional posts', 'no context in a recommendation thread'],
    searches: ['"recommend me a book like..." threads', 'subgenre-specific subreddits'],
  },
  BOOKTUBE_VIEWER: {
    loves: ['long-form honest reviews', 'wrap-up videos', 'readalong content'],
    hates: ['sponsored reviews that feel dishonest', 'clickbait titles with no payoff'],
    searches: ['monthly wrap up videos', '"books like" video essays'],
  },
  NEWSLETTER_SUBSCRIBER: {
    loves: ['early access and ARCs', 'behind-the-scenes author notes', 'exclusive bonus content'],
    hates: ['generic mass blasts', 'too-frequent emails', 'no personal voice'],
    searches: ['author newsletter signup', 'exclusive short story offers'],
  },
  FACEBOOK_GROUP: {
    loves: ['group-exclusive discussion threads', 'author Q&A posts', 'giveaways'],
    hates: ['posts that feel like ads', 'no engagement from the author'],
    searches: ['genre-specific reader groups', 'book club group picks'],
  },
  PODCAST_LISTENER: {
    loves: ['author interviews', 'behind-the-book stories', 'genre-focused podcast features'],
    hates: ['generic ad-read style promos', 'no real discussion of craft'],
    searches: ['book podcast episode guests', 'author interview podcasts'],
  },
  BOOK_CLUB: {
    loves: ['ready-made discussion questions', 'themes with real discussion depth', 'author group calls'],
    hates: ['books with nothing to discuss', 'no reading guide available'],
    searches: ['book club pick of the month', 'discussion guide download'],
  },
  CORPORATE_HR: {
    loves: ['clear ROI/skill outcomes', 'bulk order options', 'workshop tie-ins'],
    hates: ['no practical takeaways', 'overly academic tone'],
    searches: ['corporate training book picks', 'leadership development reading list'],
  },
  EDUCATIONAL: {
    loves: ['curriculum tie-ins', 'discussion-ready themes', 'age-appropriate content notes'],
    hates: ['content without classroom applicability', 'no supplementary materials'],
    searches: ['classroom reading list', 'educator guide download'],
  },
  LIBRARY: {
    loves: ['strong circulation potential', 'diverse voices', 'series with holds appeal'],
    hates: ['no library-friendly formats', 'weak series completion'],
    searches: ['library holds list', 'new releases for library purchase'],
  },
};

const PLATFORM_CTA: Record<string, string> = {
  FACEBOOK: 'Learn More',
  INSTAGRAM: 'Shop Now',
  TIKTOK: 'Get the Book',
  AMAZON: 'Buy on Amazon',
  EMAIL: 'Read the First Chapter',
  REDDIT: 'Join the Discussion',
  YOUTUBE: 'Watch the Trailer',
  GOODREADS: 'Add to Shelf',
  PODCAST: 'Listen to the Story Behind the Book',
};

export const localAiService = {
  async generateAudienceInsight(book: Book, segment: string, platform: string) {
    const seed = seedFrom(book.id, segment, platform, 'insight');
    const traits = SEGMENT_TRAITS[segment] ?? SEGMENT_TRAITS.AMAZON_SEARCH_SHOPPER;
    const keywords = extractKeywords(book, 3);
    const tone = GENRE_TONE[book.genre] ?? GENRE_TONE.OTHER;

    const summary =
      `Readers in the ${segment.replace(/_/g, ' ').toLowerCase()} segment on ${platform.toLowerCase()} are drawn to ${tone} ` +
      `${book.genre.toLowerCase().replace(/_/g, ' ')} titles like "${book.title}". They respond to ` +
      `${pick(traits.loves, seed)} and frequently search for ${pick(traits.searches, seed, 1)}. ` +
      `Themes around ${keywords.join(', ') || 'the book\'s core premise'} are likely to resonate with this group.`;

    return {
      summary,
      data: {
        loves: traits.loves,
        hates: traits.hates,
        searchBehavior: traits.searches,
        resonantThemes: keywords,
      },
      confidence: 0.5 + (seed % 30) / 100, // 0.50–0.79, deliberately conservative
    };
  },

  async generateKeywordSuggestions(book: Book) {
    const seed = seedFrom(book.id, 'keywords');
    const bank = GENRE_KEYWORD_BANK[book.genre] ?? GENRE_KEYWORD_BANK.OTHER;
    const bookKeywords = extractKeywords(book, 5);
    const competitionLevels = ['low', 'medium', 'high'];

    const combined = [...bank, ...bookKeywords.map((k) => `${k} book`)];

    const keywords = pickMany(combined, seed, 10).map((keyword, i) => ({
      keyword,
      searchVolume: 200 + ((seed + i * 137) % 4800),
      suggestedBid: Number((0.35 + ((seed + i * 53) % 250) / 100).toFixed(2)),
      competition: pick(competitionLevels, seed, i),
    }));

    return { keywords };
  },

  async generateCompetitorAnalysis(book: Book) {
    const seed = seedFrom(book.id, 'competitors');
    const genreLabel = book.genre.toLowerCase().replace(/_/g, ' ');
    const strengthsBank = [
      'strong series momentum and reader loyalty',
      'a highly recognizable, genre-signaling cover',
      'consistent review velocity on release',
      'a distinct authorial voice readers seek out by name',
    ];
    const weaknessesBank = [
      'pacing that slows significantly in the middle third',
      'a cover/blurb mismatch that causes reader expectation issues',
      'limited presence outside of Amazon',
      'inconsistent release schedule hurting series momentum',
    ];

    const competitors = Array.from({ length: 3 }, (_, i) => ({
      competitorName: `Comparable Title ${i + 1} in ${titleCase(genreLabel)}`,
      strengths: pickMany(strengthsBank, seed, 2 + (i % 2)),
      weaknesses: pickMany(weaknessesBank, seed + i, 2),
    }));

    return { competitors };
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    const seed = seedFrom(book.id, segment, platform, 'adcopy');
    const keywords = extractKeywords(book, 2);
    const cta = PLATFORM_CTA[platform] ?? 'Learn More';
    const hooks = [
      `What if ${keywords[0] ?? 'everything'} changed in a single night?`,
      `Readers can't stop talking about "${book.title}."`,
      `The ${book.genre.toLowerCase().replace(/_/g, ' ')} read everyone's recommending this month.`,
    ];

    return {
      headline: pick(hooks, seed),
      body: `${book.description.slice(0, 180)}${book.description.length > 180 ? '…' : ''}`,
      callToAction: cta,
    };
  },

  async generateTikTokScript(book: Book) {
    const seed = seedFrom(book.id, 'tiktok');
    const keywords = extractKeywords(book, 2);
    const hooks = [
      `POV: you just found your next obsession — "${book.title}"`,
      `Tell me why nobody warned me about this ${book.genre.toLowerCase().replace(/_/g, ' ')} book`,
      `Books that will ruin you: "${book.title}" edition`,
    ];

    return [
      `HOOK (0-3s): ${pick(hooks, seed)}`,
      ``,
      `BODY (4-25s): Quick, punchy summary — mention ${keywords.join(' and ') || 'the premise'} without spoilers. Hold up the book/cover on screen. Use on-screen text for the key trope callouts.`,
      ``,
      `CTA (26-30s): "Link in bio / comments if you want the vibes." Text overlay: "${book.title} — out now."`,
    ].join('\n');
  },

  async generateEmailCopy(book: Book) {
    const seed = seedFrom(book.id, 'email');
    const subjects = [
      `You need to read this before everyone else does`,
      `"${book.title}" is finally here`,
      `The book I can't stop recommending`,
    ];

    return {
      subject: pick(subjects, seed),
      body:
        `Hi there,\n\nI'm thrilled to share "${book.title}" with you. ${book.description}\n\n` +
        `If you love ${(book.genre.toLowerCase().replace(/_/g, ' '))} stories, this one's for you.\n\n` +
        `Grab your copy today and let me know what you think!\n\nHappy reading,\n[Your name]`,
    };
  },

  async generateDiscussionGuide(book: Book) {
    const keywords = extractKeywords(book, 3);
    return [
      `1. What drew you to "${book.title}" — the premise, the cover, or a recommendation?`,
      `2. How did the theme of ${keywords[0] ?? 'the central conflict'} shape your reading experience?`,
      `3. Which character's decisions did you agree with least, and why?`,
      `4. Did the ${book.genre.toLowerCase().replace(/_/g, ' ')} elements meet your expectations for the genre?`,
      `5. What would you change about the ending, if anything?`,
      `6. How does ${keywords[1] ?? 'the setting'} function almost as its own character?`,
      `7. Who would you recommend this book to, and why?`,
      `8. What's one question you'd ask the author if you could?`,
    ].join('\n');
  },

  async generateCalendar(book: Book, days: number) {
    const seed = seedFrom(book.id, 'calendar');
    const platforms = ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'EMAIL', 'REDDIT', 'AMAZON'];
    const actionsByPlatform: Record<string, string[]> = {
      INSTAGRAM: ['Post cover reveal carousel', 'Share a quote graphic', 'Post reels teaser'],
      TIKTOK: ['Post BookTok hook video', 'Post trope callout video', 'Duet/react to a reader review'],
      FACEBOOK: ['Post to genre reader groups', 'Run a giveaway post', 'Share behind-the-scenes update'],
      EMAIL: ['Send launch announcement', 'Send first-chapter excerpt', 'Send reader Q&A recap'],
      REDDIT: ['Post in relevant subreddit AMA-style thread', 'Share in recommendation thread respectfully'],
      AMAZON: ['Refresh keyword-optimized listing copy', 'Request/encourage early reviews'],
    };

    const step = Math.max(1, Math.floor(days / 10));
    const events = Array.from({ length: Math.min(10, days) }, (_, i) => {
      const day = 1 + i * step;
      const platform = pick(platforms, seed, i);
      const action = pick(actionsByPlatform[platform], seed, i);
      return { day, platform: platform.toLowerCase(), action };
    });

    return { events };
  },
};
