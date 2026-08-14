/**
 * Scrapes public pages/APIs and extracts real, human-readable text — page
 * title, meta description, and a handful of review/comment snippets —
 * instead of just a byte count. That text is what `groq-ai.service.ts`
 * feeds to the LLM as grounding context, so audience-insight and
 * competitor-analysis output reflects what readers are *actually* saying
 * on Goodreads/Amazon/Reddit rather than only the book's own blurb.
 *
 * Every method degrades to `{ error: true }` on failure (blocked request,
 * timeout, layout change) rather than throwing — a scrape failing should
 * never fail the whole audit, it just means less context for the AI step.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

export interface ScrapeResult {
  source: 'goodreads' | 'amazon' | 'reddit';
  error?: boolean;
  title?: string;
  description?: string;
  /** Short review/comment/post snippets pulled from the page, newest or most relevant first. */
  snippets?: string[];
  rating?: string;
  ratingCount?: string;
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

function cleanText(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Combines a `ScrapeResult`'s extracted text into one block for LLM context. Empty string if nothing useful was scraped. */
export function scrapedTextFor(result: ScrapeResult | null | undefined): string {
  if (!result || result.error) return '';
  const parts: string[] = [];
  if (result.title) parts.push(`Title: ${result.title}`);
  if (result.rating) parts.push(`Rating: ${result.rating}${result.ratingCount ? ` (${result.ratingCount} ratings)` : ''}`);
  if (result.description) parts.push(`Description: ${result.description}`);
  if (result.snippets?.length) {
    parts.push(`Reader comments:\n${result.snippets.map((s) => `- ${s}`).join('\n')}`);
  }
  return parts.join('\n');
}

/** Merges several scrape results into a single context block, labeled by source, for the audience-insight prompt. */
export function combineScrapedContext(results: Array<ScrapeResult | null | undefined>): string {
  return results
    .filter((r): r is ScrapeResult => !!r && !r.error)
    .map((r) => `[${r.source}]\n${scrapedTextFor(r)}`)
    .filter(Boolean)
    .join('\n\n');
}

export const scraperService = {
  async scrapeGoodreads(url: string): Promise<ScrapeResult> {
    try {
      const { data } = await axios.get<string>(url, { timeout: 10000, headers: REQUEST_HEADERS });
      const $ = cheerio.load(data);

      const title = cleanText($('h1[data-testid="bookTitle"]').first().text() || $('title').first().text());
      const description = cleanText(
        $('[data-testid="description"]').first().text() || $('meta[name="description"]').attr('content')
      ).slice(0, 1200);
      const rating = cleanText($('[data-testid="ratingsCount"]').first().text()).match(/[\d.]+/)?.[0];
      const ratingCount = cleanText($('[data-testid="ratingsCount"]').first().text()).match(
        /([\d,]+)\s*ratings?/i
      )?.[1];

      const snippets = $('[data-testid="ReviewText"], .reviewText, .readable')
        .slice(0, 8)
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter((s) => s.length > 20)
        .slice(0, 5);

      return { source: 'goodreads', title: title || undefined, description: description || undefined, rating, ratingCount, snippets };
    } catch (error) {
      logger.warn('Goodreads scrape failed', { url, error: (error as Error).message });
      return { source: 'goodreads', error: true };
    }
  },

  async scrapeAmazon(url: string): Promise<ScrapeResult> {
    try {
      const { data } = await axios.get<string>(url, { timeout: 10000, headers: REQUEST_HEADERS });
      const $ = cheerio.load(data);

      const title = cleanText($('#productTitle').first().text() || $('title').first().text());
      const description = cleanText(
        $('#bookDescription_feature_div').first().text() || $('meta[name="description"]').attr('content')
      ).slice(0, 1200);
      const rating = cleanText($('#acrPopover, span[data-hook="rating-out-of-text"]').first().text()).match(
        /[\d.]+/
      )?.[0];
      const ratingCount = cleanText($('#acrCustomerReviewText').first().text()).match(/([\d,]+)/)?.[1];

      const snippets = $('[data-hook="review-body"]')
        .slice(0, 8)
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter((s) => s.length > 20)
        .slice(0, 5);

      return { source: 'amazon', title: title || undefined, description: description || undefined, rating, ratingCount, snippets };
    } catch (error) {
      // Amazon aggressively blocks datacenter IPs/bots — this failing is
      // expected in a lot of environments, hence `warn` rather than `error`.
      logger.warn('Amazon scrape failed', { url, error: (error as Error).message });
      return { source: 'amazon', error: true };
    }
  },

  async scrapeRedditMentions(query: string): Promise<ScrapeResult> {
    try {
      const { data } = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, limit: 10, sort: 'relevance' },
        timeout: 10000,
        headers: { 'User-Agent': 'BookMarketingOS/1.0 (audience-research bot)' },
      });

      const posts: Array<{ data?: { title?: string; selftext?: string; score?: number } }> =
        data?.data?.children ?? [];

      const snippets = posts
        .map((p) => {
          const title = cleanText(p.data?.title);
          const body = cleanText(p.data?.selftext).slice(0, 200);
          return [title, body].filter(Boolean).join(' — ');
        })
        .filter((s) => s.length > 10)
        .slice(0, 8);

      return {
        source: 'reddit',
        description: `${posts.length} discussion threads mentioning "${query}"`,
        snippets,
      };
    } catch (error) {
      logger.warn('Reddit scrape failed', { query, error: (error as Error).message });
      return { source: 'reddit', error: true };
    }
  },
};
