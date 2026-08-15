/**
 * Scrapes public pages/APIs and extracts real text plus named readers.
 * Sources: Goodreads, Amazon, Reddit, YouTube, Twitter/X.
 *
 * Uses scrape-cache (memory primary, Redis optional fallback).
 * Every method degrades to `{ error: true }` rather than throwing.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { scrapeCache, acquireRateSlot } from './scrape-cache.service';

export type ScrapeSource = 'goodreads' | 'amazon' | 'reddit' | 'youtube' | 'twitter';

export interface ScrapedReader {
  name: string;
  source: ScrapeSource;
  quote: string;
  profileUrl?: string;
  rating?: string;
}

export interface ScrapeResult {
  source: ScrapeSource;
  error?: boolean;
  fromCache?: boolean;
  title?: string;
  description?: string;
  snippets?: string[];
  readers?: ScrapedReader[];
  rating?: string;
  ratingCount?: string;
  sentimentSummary?: {
    positive: number;
    neutral: number;
    negative: number;
    average: number;
  };
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const YT_RATE_LIMIT = 8;
const YT_RATE_WINDOW_SEC = 600;
const YT_CACHE_TTL_SEC = 60 * 60 * 12;
const DEFAULT_CACHE_TTL_SEC = 60 * 60 * 6;

function cleanText(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

const POS_WORDS = new Set(
  'love loved amazing wonderful excellent great best recommend brilliant captivating emotional beautiful powerful masterpiece favorite favourite hooked compelling inspiring'.split(
    ' '
  )
);
const NEG_WORDS = new Set(
  'hate hated terrible awful boring worst disappointing slow waste predictable confusing poorly weak shallow DNF abandoned overhyped trash mediocre'.split(
    ' '
  )
);

function scoreSentiment(text: string): { score: number; label: 'positive' | 'neutral' | 'negative' } {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/);
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (POS_WORDS.has(t)) pos += 1;
    if (NEG_WORDS.has(t)) neg += 1;
  }
  const total = pos + neg;
  if (total === 0) return { score: 0, label: 'neutral' };
  const score = (pos - neg) / total;
  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { score: Math.round(score * 100) / 100, label };
}

function summarizeSentiment(readers: ScrapedReader[]): ScrapeResult['sentimentSummary'] {
  if (!readers.length) return undefined;
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let sum = 0;
  for (const r of readers) {
    const s = scoreSentiment(r.quote).score;
    sum += s;
    if (s > 0.15) positive += 1;
    else if (s < -0.15) negative += 1;
    else neutral += 1;
  }
  return {
    positive,
    neutral,
    negative,
    average: Math.round((sum / readers.length) * 100) / 100,
  };
}

async function withCache(
  source: ScrapeSource,
  identity: string,
  live: () => Promise<ScrapeResult>,
  ttlSec = DEFAULT_CACHE_TTL_SEC
): Promise<ScrapeResult> {
  try {
    const result = await live();
    if (!result.error) {
      await scrapeCache.set(source, identity, result, ttlSec);
      return result;
    }
  } catch (error) {
    logger.warn('Live scrape threw', { source, identity, error: (error as Error).message });
  }

  const cached = await scrapeCache.get<ScrapeResult>(source, identity);
  if (cached && !cached.error) {
    logger.info('Serving scrape from cache after live failure', { source, identity });
    return { ...cached, fromCache: true };
  }

  return { source, error: true };
}

export function scrapedTextFor(result: ScrapeResult | null | undefined): string {
  if (!result || result.error) return '';
  const parts: string[] = [];
  if (result.fromCache) parts.push('(cached snapshot)');
  if (result.title) parts.push(`Title: ${result.title}`);
  if (result.rating) {
    parts.push(
      `Rating: ${result.rating}${result.ratingCount ? ` (${result.ratingCount} ratings)` : ''}`
    );
  }
  if (result.description) parts.push(`Description: ${result.description}`);
  if (result.sentimentSummary) {
    const s = result.sentimentSummary;
    parts.push(
      `Sentiment: avg ${s.average} (pos ${s.positive} / neu ${s.neutral} / neg ${s.negative})`
    );
  }
  if (result.readers?.length) {
    parts.push(
      `Individual readers:\n${result.readers
        .map((r) => `- ${r.name}${r.rating ? ` (${r.rating})` : ''}: "${r.quote}"`)
        .join('\n')}`
    );
  } else if (result.snippets?.length) {
    parts.push(`Reader comments:\n${result.snippets.map((s) => `- ${s}`).join('\n')}`);
  }
  return parts.join('\n');
}

export function combineScrapedContext(results: Array<ScrapeResult | null | undefined>): string {
  return results
    .filter((r): r is ScrapeResult => !!r && !r.error)
    .map((r) => `[${r.source}${r.fromCache ? '/cache' : ''}]\n${scrapedTextFor(r)}`)
    .filter(Boolean)
    .join('\n\n');
}

export function collectReaders(results: Array<ScrapeResult | null | undefined>): ScrapedReader[] {
  const out: ScrapedReader[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r || r.error || !r.readers?.length) continue;
    for (const reader of r.readers) {
      const key = `${reader.source}|${reader.name}|${reader.quote.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(reader);
    }
  }
  return out;
}

export const scraperService = {
  async scrapeGoodreads(url: string): Promise<ScrapeResult> {
    return withCache('goodreads', url, async () => {
      const { data } = await axios.get<string>(url, { timeout: 12000, headers: REQUEST_HEADERS });
      const $ = cheerio.load(data);

      const title = cleanText(
        $('h1[data-testid="bookTitle"]').first().text() || $('title').first().text()
      );
      const description = cleanText(
        $('[data-testid="description"]').first().text() ||
          $('meta[name="description"]').attr('content')
      ).slice(0, 1200);
      const ratingText = cleanText($('[data-testid="ratingsCount"]').first().text());
      const rating = ratingText.match(/[\d.]+/)?.[0];
      const ratingCount = ratingText.match(/([\d,]+)\s*ratings?/i)?.[1];

      const readers: ScrapedReader[] = [];
      $('[data-testid="review"]').each((_, el) => {
        if (readers.length >= 10) return false;
        const name =
          cleanText($(el).find('[data-testid="name"]').first().text()) ||
          cleanText($(el).find('a[href*="/user/show/"]').first().text()) ||
          'Goodreads reader';
        const quote = cleanText(
          $(el).find('[data-testid="content"]').first().text() ||
            $(el).find('[data-testid="ReviewText"], .ReviewText, .readable').first().text()
        );
        const href = $(el).find('a[href*="/user/show/"]').first().attr('href');
        const profileUrl = href
          ? href.startsWith('http')
            ? href
            : `https://www.goodreads.com${href}`
          : undefined;
        if (quote.length > 25) {
          readers.push({
            name: name.slice(0, 80),
            source: 'goodreads',
            quote: quote.slice(0, 400),
            profileUrl,
          });
        }
      });

      if (readers.length === 0) {
        $('.review, .friendReviews .review').each((_, el) => {
          if (readers.length >= 10) return false;
          const name =
            cleanText($(el).find('a.user, a[href*="/user/show/"]').first().text()) ||
            'Goodreads reader';
          const quote = cleanText(
            $(el).find('.reviewText, .readable, span[itemprop="reviewBody"]').first().text()
          );
          if (quote.length > 25) {
            readers.push({
              name: name.slice(0, 80),
              source: 'goodreads',
              quote: quote.slice(0, 400),
            });
          }
        });
      }

      const snippets =
        readers.length > 0
          ? readers.map((r) => r.quote).slice(0, 5)
          : $('[data-testid="ReviewText"], .reviewText, .readable')
              .slice(0, 8)
              .map((_, el) => cleanText($(el).text()))
              .get()
              .filter((s) => s.length > 20)
              .slice(0, 5);

      return {
        source: 'goodreads',
        title: title || undefined,
        description: description || undefined,
        rating,
        ratingCount,
        snippets,
        readers,
      };
    });
  },

  async scrapeAmazon(url: string): Promise<ScrapeResult> {
    return withCache('amazon', url, async () => {
      const { data } = await axios.get<string>(url, { timeout: 12000, headers: REQUEST_HEADERS });
      const $ = cheerio.load(data);

      const title = cleanText($('#productTitle').first().text() || $('title').first().text());
      const description = cleanText(
        $('#bookDescription_feature_div').first().text() ||
          $('meta[name="description"]').attr('content')
      ).slice(0, 1200);
      const rating = cleanText(
        $('#acrPopover, span[data-hook="rating-out-of-text"]').first().text()
      ).match(/[\d.]+/)?.[0];
      const ratingCount = cleanText($('#acrCustomerReviewText').first().text()).match(
        /([\d,]+)/
      )?.[1];

      const readers: ScrapedReader[] = [];
      $('[data-hook="review"], .review').each((_, el) => {
        if (readers.length >= 10) return false;
        const name =
          cleanText($(el).find('.a-profile-name').first().text()) ||
          cleanText($(el).find('[data-hook="review-author"]').first().text()) ||
          'Amazon customer';
        const quote = cleanText($(el).find('[data-hook="review-body"]').first().text());
        const stars = cleanText(
          $(el).find('[data-hook="review-star-rating"], .a-icon-alt').first().text()
        ).match(/[\d.]+/)?.[0];
        if (quote.length > 20) {
          readers.push({
            name: name.slice(0, 80),
            source: 'amazon',
            quote: quote.slice(0, 400),
            rating: stars ? `${stars}/5` : undefined,
          });
        }
      });

      const snippets =
        readers.length > 0
          ? readers.map((r) => r.quote).slice(0, 5)
          : $('[data-hook="review-body"]')
              .slice(0, 8)
              .map((_, el) => cleanText($(el).text()))
              .get()
              .filter((s) => s.length > 20)
              .slice(0, 5);

      return {
        source: 'amazon',
        title: title || undefined,
        description: description || undefined,
        rating,
        ratingCount,
        snippets,
        readers,
      };
    });
  },

  async scrapeRedditMentions(query: string): Promise<ScrapeResult> {
    return withCache('reddit', query, async () => {
      const { data } = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, limit: 12, sort: 'relevance', t: 'year' },
        timeout: 12000,
        headers: { 'User-Agent': 'BookMarketingOS/1.0 (audience-research bot)' },
      });

      const posts: Array<{
        data?: {
          title?: string;
          selftext?: string;
          author?: string;
          permalink?: string;
        };
      }> = data?.data?.children ?? [];

      const readers: ScrapedReader[] = [];
      const snippets: string[] = [];

      for (const p of posts) {
        const d = p.data;
        if (!d) continue;
        const title = cleanText(d.title);
        const body = cleanText(d.selftext).slice(0, 280);
        const quote = [title, body].filter(Boolean).join(' — ');
        if (quote.length < 12) continue;
        snippets.push(quote);
        const author = d.author && d.author !== '[deleted]' ? `u/${d.author}` : 'Reddit user';
        readers.push({
          name: author,
          source: 'reddit',
          quote: quote.slice(0, 400),
          profileUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
        });
      }

      return {
        source: 'reddit',
        description: `${posts.length} discussion threads matching "${query}"`,
        snippets: snippets.slice(0, 8),
        readers: readers.slice(0, 10),
        sentimentSummary: summarizeSentiment(readers),
      };
    });
  },

  async scrapeYouTubeSearch(query: string): Promise<ScrapeResult> {
    const identity = query.trim().toLowerCase();

    const slot = await acquireRateSlot('youtube', YT_RATE_LIMIT, YT_RATE_WINDOW_SEC);
    if (!slot.allowed) {
      const cached = await scrapeCache.get<ScrapeResult>('youtube', identity);
      if (cached && !cached.error) {
        logger.info('YouTube rate limited — serving cache', { query });
        return { ...cached, fromCache: true };
      }
      logger.warn('YouTube rate limited and no cache', { query });
      return { source: 'youtube', error: true };
    }

    return withCache(
      'youtube',
      identity,
      async () => {
        const { data } = await axios.get<string>('https://www.youtube.com/results', {
          params: { search_query: query },
          timeout: 12000,
          headers: REQUEST_HEADERS,
        });

        const readers: ScrapedReader[] = [];
        const match = data.match(/ytInitialData\s*=\s*(\{.+?\});\s*</);
        if (match) {
          try {
            const json = JSON.parse(match[1]);
            const contents =
              json?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents ?? [];
            for (const section of contents) {
              const items = section?.itemSectionRenderer?.contents ?? [];
              for (const item of items) {
                const v = item?.videoRenderer;
                if (!v) continue;
                const title = cleanText(v.title?.runs?.[0]?.text);
                const channel = cleanText(v.ownerText?.runs?.[0]?.text);
                const videoId = v.videoId as string | undefined;
                if (!title || !channel) continue;
                readers.push({
                  name: channel,
                  source: 'youtube',
                  quote: title,
                  profileUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
                });
                if (readers.length >= 12) break;
              }
              if (readers.length >= 12) break;
            }
          } catch {
            // regex fallback
          }
        }

        if (readers.length === 0) {
          const titleRe = /"title":\{"runs":\[\{"text":"([^"]{8,120})"\}/g;
          let m: RegExpExecArray | null;
          let i = 0;
          while ((m = titleRe.exec(data)) && i < 10) {
            readers.push({
              name: 'YouTube creator',
              source: 'youtube',
              quote: cleanText(m[1]),
            });
            i++;
          }
        }

        return {
          source: 'youtube',
          description: `YouTube search results for "${query}"`,
          snippets: readers.map((r) => r.quote),
          readers,
          sentimentSummary: summarizeSentiment(readers),
        };
      },
      YT_CACHE_TTL_SEC
    );
  },

  async scrapeTwitterSentiment(query: string): Promise<ScrapeResult> {
    const identity = query.trim().toLowerCase();
    const bearer = (process.env.TWITTER_BEARER_TOKEN || process.env.X_BEARER_TOKEN || '').trim();

    return withCache('twitter', identity, async () => {
      if (!bearer) {
        logger.info('Twitter scrape skipped (no TWITTER_BEARER_TOKEN)');
        return { source: 'twitter', error: true };
      }

      const { data } = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
        params: {
          query: `${query} (book OR reading OR novel OR #booktok OR #bookstagram) -is:retweet lang:en`,
          max_results: 20,
          'tweet.fields': 'public_metrics,created_at,lang',
          expansions: 'author_id',
          'user.fields': 'username,name',
        },
        timeout: 12000,
        headers: {
          Authorization: `Bearer ${bearer}`,
          'User-Agent': 'BookMarketingOS/1.0',
        },
      });

      type Tweet = { id: string; text: string; author_id?: string };
      type User = { id: string; username?: string; name?: string };
      const tweets: Tweet[] = data?.data ?? [];
      const users: User[] = data?.includes?.users ?? [];
      const userById = new Map(users.map((u) => [u.id, u]));

      const readers: ScrapedReader[] = tweets.slice(0, 15).map((t) => {
        const u = t.author_id ? userById.get(t.author_id) : undefined;
        const name = u?.username ? `@${u.username}` : u?.name || 'Twitter reader';
        return {
          name,
          source: 'twitter' as const,
          quote: cleanText(t.text).slice(0, 400),
          profileUrl: t.id ? `https://twitter.com/i/web/status/${t.id}` : undefined,
        };
      });

      return {
        source: 'twitter',
        description: `${tweets.length} recent posts matching "${query}"`,
        snippets: readers.map((r) => r.quote),
        readers,
        sentimentSummary: summarizeSentiment(readers),
      };
    });
  },
};