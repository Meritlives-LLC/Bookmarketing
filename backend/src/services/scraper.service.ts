import axios from 'axios';
import { logger } from '../utils/logger';

export const scraperService = {
  async scrapeGoodreads(url: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { htmlLength: typeof data === 'string' ? data.length : 0, source: 'goodreads' };
    } catch (error) {
      logger.warn('Goodreads scrape failed', { url, error: (error as Error).message });
      return { source: 'goodreads', error: true };
    }
  },

  async scrapeAmazon(url: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { htmlLength: typeof data === 'string' ? data.length : 0, source: 'amazon' };
    } catch (error) {
      logger.warn('Amazon scrape failed', { url, error: (error as Error).message });
      return { source: 'amazon', error: true };
    }
  },

  async scrapeRedditMentions(query: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, limit: 10 },
        timeout: 10000,
        headers: { 'User-Agent': 'BookMarketingOS/1.0' },
      });
      return { source: 'reddit', resultCount: data?.data?.children?.length ?? 0 };
    } catch (error) {
      logger.warn('Reddit scrape failed', { query, error: (error as Error).message });
      return { source: 'reddit', error: true };
    }
  },
};
