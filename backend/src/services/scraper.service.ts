/**
 * Scrapes public pages/APIs and extracts real text plus *named readers*
 * (name + quote + source) for audience grounding.
 *
 * Every method degrades to `{ error: true }` on failure rather than throwing.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

export interface ScrapedReader {
  name: string;
  source: 'goodreads' | 'amazon' | 'reddit';
  quote: string;
  profileUrl?: string;
  rating?: string;
}

export interface ScrapeResult {
  source: 'goodreads' | 'amazon' | 'reddit';
  error?: boolean;
  title?: string;
  description?: string;
  snippets?: string[];
  readers?: ScrapedReader[];
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

export function scrapedTextFor(result: ScrapeResult | null | undefined): string {
  if (!result || result.error) return '';
  const parts: string[] = [];
  if (result.title) parts.push(`Title: ${result.title}`);
  if (result.rating) {
    parts.push(
      `Rating: ${result.rating}${result.ratingCount ? ` (${result.ratingCount} ratings)` : ''}`
    );
  }
  if (result.description) parts.push(`Description: ${result.description}`);
  if (result.readers?.length) {
    parts.push(
      `Individual readers:\n${result.readers
        .map(
          (r) =>
            `- ${r.name}${r.rating ? ` (${r.rating})` : ''}: "${r.quote}"`
        )
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
    .map((r) => `[${r.source}]\n${scrapedTextFor(r)}`)
    .filter(Boolean)
    .join('\n\n');
}

/** Flatten unique named readers from successful scrapes. */
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
    try {
      const { data } = await axios.get<string>(url, { timeout: 10000, headers: REQUEST_HEADERS });
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
    } catch (error) {
      logger.warn('Amazon scrape failed', { url, error: (error as Error).message });
      return { source: 'amazon', error: true };
    }
  },

  async scrapeRedditMentions(query: string): Promise<ScrapeResult> {
    try {
      const { data } = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, limit: 12, sort: 'relevance' },
        timeout: 10000,
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
        description: `${posts.length} discussion threads mentioning "${query}"`,
        snippets: snippets.slice(0, 8),
        readers: readers.slice(0, 10),
      };
    } catch (error) {
      logger.warn('Reddit scrape failed', { query, error: (error as Error).message });
      return { source: 'reddit', error: true };
    }
  },
};