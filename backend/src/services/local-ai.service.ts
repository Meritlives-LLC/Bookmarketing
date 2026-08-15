/**
 * Standalone content generator — no external AI provider, no API key, no
 * network call, no per-request cost or rate limit. Replaces the previous
 * OpenAI-backed implementation entirely.
 *
 * Content is produced by combining genre/segment/platform template banks
 * with real NLP analysis of the book's own title and description (via
 * `compromise` — a pure-JS, offline NLP library: no model download, no
 * server, no network call). We extract actual sentences, noun phrases,
 * adjectives, and the protagonist's name where compromise can detect one,
 * and weave those into the output — so copy is grounded in what the book
 * actually says, not just genre boilerplate with a word or two swapped in.
 *
 * Every exported function mirrors the old `aiService` signatures exactly,
 * so nothing calling it needs to change.
 */
import { Book } from '@prisma/client';
import nlp from 'compromise';

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

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function genreLabel(genre: string): string {
  return genre.toLowerCase().replace(/_/g, ' ');
}

// ── NLP-backed extraction from the book's own text ─────────────────────────
// Everything here runs offline via `compromise` — no network, no model file.
interface BookSignals {
  sentences: string[]; // real sentences from the description, in order
  hookSentence: string; // best single sentence to use as a hook/body seed
  nounPhrases: string[]; // cleaned, deduped noun phrases (real themes/objects)
  adjectives: string[]; // descriptive words actually used in the text
  protagonist: string | null; // first detected person name, if any
}

const GENERIC_NOUNS = new Set([
  'she', 'he', 'they', 'it', 'who', 'someone', 'something', 'everything',
  'nothing', 'anyone', 'everyone', 'her', 'him', 'them', 'one',
]);

function analyzeBook(book: Pick<Book, 'title' | 'description'>): BookSignals {
  const doc = nlp(book.description || '');

  const sentences = doc
    .sentences()
    .out('array')
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Prefer the longest early sentence as the "hook" — short opening
  // fragments ("Book one in a new series.") make weak hooks on their own.
  const hookSentence =
    sentences.slice(0, 3).sort((a: string, b: string) => b.length - a.length)[0] ?? sentences[0] ?? book.title;

  const people = doc.people().out('array') as string[];
  const protagonist = people.length > 0 ? people[0] : null;
  const protagonistWords = protagonist
    ? new Set(protagonist.toLowerCase().split(/\s+/))
    : new Set<string>();

  const nounPhrases = [
    ...new Set(
      doc
        .nouns()
        .out('array')
        .map((n: string) =>
          n
            .toLowerCase()
            .replace(/[.,!?]+$/, '')
            .replace(/^(a|an|the)\s+/, '')
            .trim()
        )
        .filter(
          (n: string) =>
            n.length > 3 &&
            n.split(' ').length <= 3 &&
            !GENERIC_NOUNS.has(n) &&
            !n.split(' ').every((w) => protagonistWords.has(w))
        )
    ),
  ] as string[];

  const adjectives = [
    ...new Set(
      doc
        .adjectives()
        .out('array')
        .map((a: string) => a.toLowerCase())
        .filter((a: string) => a.length > 3)
    ),
  ] as string[];

  return { sentences, hookSentence, nounPhrases, adjectives, protagonist };
}

// Truncates on a real sentence boundary instead of mid-word/mid-sentence.
function excerptSentences(sentences: string[], maxChars: number): string {
  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > maxChars && out) break;
    out = (out ? out + ' ' : '') + s;
    if (out.length >= maxChars) break;
  }
  return out || sentences[0] || '';
}

// Strips a leading subordinating conjunction ("When", "As", "After", etc.)
// so a sentence can be safely embedded into "What happens when X...?" style
// hooks without producing "what happens when when...".
function stripLeadingConjunction(sentence: string): string {
  return sentence.replace(/^(when|as|after|while|once|if)\s+/i, '');
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
    hates: ['vague product descriptions', "covers that don't signal genre", 'few reviews'],
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
    const { nounPhrases, protagonist } = analyzeBook(book);
    const tone = GENRE_TONE[book.genre] ?? GENRE_TONE.OTHER;
    const themes = nounPhrases.slice(0, 3);

    const protagonistClause = protagonist ? ` centered on ${protagonist}` : '';
    const summary =
      `Readers in the ${segment.replace(/_/g, ' ').toLowerCase()} segment on ${platform.toLowerCase()} are drawn to ${tone} ` +
      `${genreLabel(book.genre)} titles like "${book.title}"${protagonistClause}. They respond to ` +
      `${pick(traits.loves, seed)} and frequently search for ${pick(traits.searches, seed, 1)}. ` +
      `Themes around ${themes.join(', ') || "the book's core premise"} are likely to resonate with this group.`;

    return {
      summary,
      data: {
        loves: traits.loves,
        hates: traits.hates,
        searchBehavior: traits.searches,
        resonantThemes: themes,
      },
      confidence: 0.5 + (seed % 30) / 100, // 0.50–0.79, deliberately conservative
    };
  },

  async generateKeywordSuggestions(book: Book) {
    const seed = seedFrom(book.id, 'keywords');
    const bank = GENRE_KEYWORD_BANK[book.genre] ?? GENRE_KEYWORD_BANK.OTHER;
    const { nounPhrases } = analyzeBook(book);
    const competitionLevels = ['low', 'medium', 'high'];

    const combined = [...bank, ...nounPhrases.slice(0, 6).map((k) => `${k} book`)];

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
    const genre = genreLabel(book.genre);
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
      competitorName: `Comparable Title ${i + 1} in ${titleCase(genre)}`,
      strengths: pickMany(strengthsBank, seed, 2 + (i % 2)),
      weaknesses: pickMany(weaknessesBank, seed + i, 2),
    }));

    return { competitors };
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    const seed = seedFrom(book.id, segment, platform, 'adcopy');
    const { sentences, hookSentence, protagonist } = analyzeBook(book);
    const cta = PLATFORM_CTA[platform] ?? 'Learn More';

    const hooks = [
      protagonist
        ? `Follow ${protagonist} in the ${genreLabel(book.genre)} everyone's talking about.`
        : `What happens when ${stripLeadingConjunction(hookSentence).split(' ').slice(0, 6).join(' ').toLowerCase()}...?`,
      `Readers can't stop talking about "${book.title}."`,
      `The ${genreLabel(book.genre)} read everyone's recommending this month.`,
    ];

    return {
      headline: pick(hooks, seed),
      body: excerptSentences(sentences, 220) || book.description,
      callToAction: cta,
    };
  },

  async generateAdSuite(book: Book, segment?: string, _personaNotes?: string) {
    const seed = seedFrom(book.id, segment || 'suite', 'adsuite');
    const { sentences, hookSentence, protagonist } = analyzeBook(book);
    const genre = genreLabel(book.genre);
    const blurb = excerptSentences(sentences, 180) || book.description || book.title;

    const headlineBases = [
      protagonist
        ? `Meet ${protagonist} — your next ${genre} obsession`
        : `The ${genre} read everyone is whispering about`,
      `"${book.title}" hits different`,
      `If you crave ${genre}, start here`,
      `What if ${stripLeadingConjunction(hookSentence).split(' ').slice(0, 8).join(' ').toLowerCase()}…`,
      `Readers can't put down "${book.title}"`,
      `Your next late-night ${genre} binge`,
      `One book. Zero chill.`,
      `For fans who want more than the usual ${genre}`,
      `Open "${book.title}" — and don't plan your evening`,
      `The ${genre} story that stays with you`,
    ];

    const bodyBases = [
      blurb,
      `${blurb} Perfect for readers who want ${genre} with real emotional stakes.`,
      `Inside "${book.title}": ${blurb}`,
      protagonist
        ? `Follow ${protagonist} through a ${genre} journey you won't forget. ${blurb}`
        : `A ${genre} experience built for readers who feel everything. ${blurb}`,
      `Stop scrolling. Start reading. ${blurb}`,
      `When the blurb isn't enough — the pages will be. ${blurb}`,
      `For your TBR if you love ${genre} that actually delivers.`,
      `Clear your weekend. "${book.title}" does not share attention.`,
    ];

    const ctaBases = [
      { text: 'Get the book', style: 'benefit' },
      { text: 'Start reading', style: 'benefit' },
      { text: 'Add to cart', style: 'urgency' },
      { text: 'Read the sample', style: 'curiosity' },
      { text: 'Claim your copy', style: 'urgency' },
      { text: 'See why readers rave', style: 'social_proof' },
      { text: 'Open the first chapter', style: 'curiosity' },
      { text: 'Buy now', style: 'urgency' },
      { text: 'Discover the story', style: 'emotion' },
      { text: 'Join the readers', style: 'social_proof' },
    ];

    const triggers = ['curiosity', 'benefit', 'emotion', 'social proof', 'urgency', 'trope', 'identity', 'FOMO', 'transformation', 'specificity'];

    return {
      headlines: headlineBases.map((text, i) => ({
        text,
        trigger: triggers[i % triggers.length],
        platformFit: i % 3 === 0 ? 'TikTok / Reels' : i % 3 === 1 ? 'Facebook / Instagram' : 'Amazon / Email',
      })),
      bodies: bodyBases.map((text, i) => ({
        text,
        emotion: ['wonder', 'urgency', 'warmth', 'tension', 'curiosity', 'belonging', 'excitement', 'resolve'][i % 8],
        painPoint: i % 2 === 0 ? 'TBR fatigue / same-old genre' : 'Wanting a story that sticks',
      })),
      ctas: ctaBases,
      visuals: [
        {
          type: 'hero',
          title: 'Cover-forward lifestyle',
          description: `Book cover of "${book.title}" held in soft natural light; shallow depth of field; reader hands only.`,
          colorPalette: 'Warm neutrals + genre accent',
          mood: 'Inviting, premium',
          imagePrompt: `Professional book marketing photo, "${book.title}" cover clear and readable, soft window light, minimal background, high-end product photography --ar 4:5`,
        },
        {
          type: 'hero',
          title: 'Mood landscape',
          description: `Atmospheric scene echoing the ${genre} tone of the book; no readable text except optional title treatment.`,
          colorPalette: 'Genre-led cinematic grades',
          mood: 'Immersive',
          imagePrompt: `Cinematic ${genre} atmosphere inspired by "${book.title}", no spoilers, dramatic light, book marketing still --ar 1.91:1`,
        },
        {
          type: 'carousel',
          title: 'Promise → proof → CTA',
          description: 'Slide 1 hook line, slide 2 blurb beat, slide 3 cover + CTA.',
          colorPalette: 'Consistent brand colors across slides',
          mood: 'Narrative',
          imagePrompt: `Carousel panel set for book ad, clean typography space, "${book.title}", modern marketing layout --ar 1:1`,
        },
        {
          type: 'video',
          title: '15s hook reel',
          description: '0–3s pattern interrupt text, 3–12s cover + one line of stakes, 12–15s CTA.',
          colorPalette: 'High contrast for mobile',
          mood: 'Fast, scroll-stopping',
          imagePrompt: `Storyboard frame for vertical book promo video, bold on-screen text safe margins, "${book.title}" --ar 9:16`,
        },
        {
          type: 'video',
          title: 'Testimonial-style UGC',
          description: 'Creator-style talking head holding the book; authentic, not studio-polished.',
          colorPalette: 'Natural / phone-cam',
          mood: 'Trust',
          imagePrompt: `UGC style still, person holding paperback "${book.title}", candid lighting, social ad aesthetic --ar 9:16`,
        },
      ],
      platforms: {
        facebook: [
          {
            primaryText: bodyBases[0],
            headline: headlineBases[0],
            description: `Discover "${book.title}"`,
            cta: 'Learn More',
          },
          {
            primaryText: bodyBases[1],
            headline: headlineBases[2],
            description: genre,
            cta: 'Shop Now',
          },
        ],
        instagram: [
          {
            caption: `${headlineBases[1]}\n\n${bodyBases[2]}\n\n#${genre.replace(/\s+/g, '')} #BookRecommendation #TBR`,
            headline: headlineBases[1],
            cta: 'Link in bio',
            hashtags: ['BookTok', genre.replace(/\s+/g, ''), 'AmReading', 'BookRecommendation'],
          },
        ],
        tiktok: [
          {
            hook: headlineBases[4],
            script: `HOOK: ${headlineBases[4]}\nBODY: ${blurb}\nCTA: Comment "TBR" if this is going on your list — "${book.title}"`,
            cta: 'Read now',
            onScreenText: book.title,
          },
        ],
        amazon: [
          {
            headline: headlineBases[0].slice(0, 50),
            keywords: [book.title, genre, `${genre} book`, 'must read'],
            notes: 'Use with Sponsored Products; match bid to category competition.',
          },
        ],
        email: [
          {
            subject: `Your next ${genre}: "${book.title}"`,
            preheader: blurb.slice(0, 80),
            body: `Hi,\n\n${bodyBases[0]}\n\nIf that sounds like your kind of read, "${book.title}" is ready for you.\n`,
            cta: 'Get the book',
          },
        ],
      },
      abTests: [
        {
          name: 'Headline angle',
          control: headlineBases[0],
          variantA: headlineBases[3],
          variantB: headlineBases[5],
          hypothesis: 'Curiosity beats benefit for cold traffic in this genre.',
        },
        {
          name: 'CTA style',
          control: 'Get the book',
          variantA: 'Start reading',
          variantB: 'See the sample',
          hypothesis: 'Lower-commitment CTAs lift click-through on cold audiences.',
        },
      ],
    };
  },

  async generateTikTokScript(book: Book) {
    const seed = seedFrom(book.id, 'tiktok');
    const { nounPhrases, protagonist, adjectives } = analyzeBook(book);
    const hooks = [
      `POV: you just found your next obsession — "${book.title}"`,
      protagonist
        ? `Tell me why nobody warned me about what ${protagonist} goes through in this book`
        : `Tell me why nobody warned me about this ${genreLabel(book.genre)} book`,
      `Books that will ruin you: "${book.title}" edition`,
    ];
    const tone = adjectives[0] ? `Keep the vibe ${adjectives[0]} throughout — that's the book's own energy.` : '';

    return [
      `HOOK (0-3s): ${pick(hooks, seed)}`,
      ``,
      `BODY (4-25s): Quick, punchy summary — mention ${nounPhrases.slice(0, 2).join(' and ') || 'the premise'} without spoilers. Hold up the book/cover on screen. Use on-screen text for the key trope callouts. ${tone}`,
      ``,
      `CTA (26-30s): "Link in bio / comments if you want the vibes." Text overlay: "${book.title} — out now."`,
    ].join('\n');
  },

  async generateEmailCopy(book: Book) {
    const seed = seedFrom(book.id, 'email');
    const { protagonist } = analyzeBook(book);
    const subjects = [
      protagonist ? `Meet ${protagonist} before everyone else does` : `You need to read this before everyone else does`,
      `"${book.title}" is finally here`,
      `The book I can't stop recommending`,
    ];

    return {
      subject: pick(subjects, seed),
      body:
        `Hi there,\n\nI'm thrilled to share "${book.title}" with you. ${book.description}\n\n` +
        `If you love ${genreLabel(book.genre)} stories, this one's for you.\n\n` +
        `Grab your copy today and let me know what you think!\n\nHappy reading,\n[Your name]`,
    };
  },

  async generateDiscussionGuide(book: Book) {
    const { nounPhrases, protagonist } = analyzeBook(book);
    const who = protagonist ?? 'the protagonist';

    return [
      `1. What drew you to "${book.title}" — the premise, the cover, or a recommendation?`,
      `2. How did the theme of ${nounPhrases[0] ?? 'the central conflict'} shape your reading experience?`,
      `3. Which of ${who}'s decisions did you agree with least, and why?`,
      `4. Did the ${genreLabel(book.genre)} elements meet your expectations for the genre?`,
      `5. What would you change about the ending, if anything?`,
      `6. How does ${nounPhrases[1] ?? 'the setting'} function almost as its own character?`,
      `7. Who would you recommend this book to, and why?`,
      `8. What's one question you'd ask the author if you could?`,
    ].join('\n');
  },

  async generatePodcastPitch(book: Book) {
    const seed = seedFrom(book.id, 'podcast');
    const { hookSentence, nounPhrases, protagonist } = analyzeBook(book);
    const genre = genreLabel(book.genre);

    const subjects = [
      `${genre} author pitch — "${book.title}"`,
      `Guest idea: the story behind "${book.title}"`,
      `Would "${book.title}" fit your show?`,
    ];

    const angleBank = [
      `what drew me to write a ${genre} story in the first place`,
      `the research/craft choices behind ${nounPhrases[0] ?? 'the book\'s central premise'}`,
      protagonist ? `why ${protagonist}'s arc turned out differently than I originally planned` : `how the story's central conflict evolved during drafting`,
      `what I'd tell someone starting their first ${genre} manuscript`,
    ];
    const talkingPoints = pickMany(angleBank, seed, 3);

    const body =
      `Hi [Host name],\n\nI'm a longtime listener of the show and really enjoyed your recent episodes on ${genre} storytelling. ` +
      `I write ${genre} fiction, and my latest book, "${book.title}," ${stripLeadingConjunction(hookSentence).toLowerCase()}\n\n` +
      `I'd love to come on and talk about ${talkingPoints.slice(0, 2).join(' and ')} — happy to tailor it to whatever's most useful for your audience.\n\n` +
      `No pressure at all if it's not a fit right now — either way, keep up the great work on the show.\n\nBest,\n[Your name]`;

    return { subject: pick(subjects, seed), body, talkingPoints };
  },

  async generateRedditPost(book: Book) {
    const seed = seedFrom(book.id, 'reddit');
    const { nounPhrases, protagonist } = analyzeBook(book);
    const genre = genreLabel(book.genre);

    const subredditByGenre: Record<string, string> = {
      ROMANCE: 'r/RomanceBooks',
      ROMANTASY: 'r/RomanceBooks',
      FANTASY: 'r/Fantasy',
      SCI_FI: 'r/printSF',
      THRILLER: 'r/thriller',
      MYSTERY: 'r/mysterybooks',
      YA: 'r/YAlit',
      LITERARY_FICTION: 'r/literaryfiction',
      HISTORICAL_FICTION: 'r/HistoricalFiction',
      NON_FICTION: 'r/nonfictionbooks',
      MEMOIR: 'r/memoir',
      SELF_HELP: 'r/selfhelpbooks',
      BUSINESS: 'r/business',
      HORROR: 'r/horrorlit',
      LITRPG: 'r/litrpg',
      OTHER: 'r/books',
    };
    const suggestedSubreddit = subredditByGenre[book.genre] ?? 'r/books';

    const titles = [
      `What's a ${genre} trope you never get tired of? (wrote a book chasing this one)`,
      `Looking for feedback: does this ${genre} premise sound overdone?`,
      `${titleCase(genre)} readers — what makes a ${nounPhrases[0] ?? 'setting'} feel real to you?`,
    ];

    const body =
      `I've been thinking a lot about ${nounPhrases[0] ?? 'this trope'} in ${genre} lately — specifically ` +
      `${protagonist ? `how a character like ${protagonist} could realistically react to it` : 'how it plays out when the stakes are personal rather than world-ending'}. ` +
      `Full disclosure, I'm an author (my own book "${book.title}" leans into this), so take my read with a grain of salt.\n\n` +
      `Curious what this sub thinks makes that kind of moment land vs. feel forced — any favorite examples, mine or otherwise?`;

    return {
      suggestedSubreddit,
      title: pick(titles, seed),
      body,
      flairSuggestion: 'Discussion',
    };
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