/**
 * Builds marketing personas + target regions from book text and scraped readers.
 * Used by audit.service so both Groq and local-ai paths get geo/persona metadata.
 */
import { Book } from '@prisma/client';
import { ScrapedReader } from './scraper.service';

export type Persona = {
  label: string;
  role: string;
  motivation: string;
  region?: string;
  evidenceSource?: string;
  evidenceQuote?: string;
};

export type TargetRegion = {
  region: string;
  priority: 'primary' | 'secondary' | 'exploratory';
  reason: string;
};

const REGION_HINTS: Array<{ pattern: RegExp; regions: string[] }> = [
  {
    pattern: /\b(nigeria|nigerian|lagos|abuja|buhari|tinubu|yoruba|igbo|hausa)\b/i,
    regions: ['Nigeria', 'West Africa', 'Nigerian diaspora (UK / US / Canada)'],
  },
  {
    pattern: /\b(kenya|nairobi|ghana|accra|south africa|lagos|africa)\b/i,
    regions: ['West Africa', 'East Africa', 'Southern Africa', 'African diaspora'],
  },
  {
    pattern: /\b(india|delhi|mumbai|bollywood)\b/i,
    regions: ['India', 'South Asian diaspora (UK / US / UAE)'],
  },
  {
    pattern: /\b(uk|britain|london|england)\b/i,
    regions: ['United Kingdom', 'Ireland', 'Commonwealth English markets'],
  },
  {
    pattern: /\b(usa|united states|america|new york)\b/i,
    regions: ['United States', 'Canada'],
  },
];

const SEGMENT_DEFAULT_REGIONS: Record<string, string[]> = {
  BOOKTOK: ['United States', 'United Kingdom', 'Philippines', 'Canada', 'Australia'],
  GOODREADS_POWER_READER: ['United States', 'United Kingdom', 'Canada', 'Australia', 'India'],
  AMAZON_SEARCH_SHOPPER: ['United States', 'United Kingdom', 'Germany', 'Canada', 'India'],
  REDDIT_COMMUNITY: ['United States', 'United Kingdom', 'Canada', 'Australia'],
  BOOKTUBE_VIEWER: ['United States', 'United Kingdom', 'India', 'Canada'],
  NEWSLETTER_SUBSCRIBER: ['United States', 'United Kingdom', 'Canada'],
  FACEBOOK_GROUP: ['United States', 'United Kingdom', 'Nigeria', 'India', 'Philippines'],
  PODCAST_LISTENER: ['United States', 'United Kingdom', 'Australia'],
  BOOK_CLUB: ['United States', 'United Kingdom', 'Canada', 'Australia'],
  CORPORATE_HR: ['United States', 'United Kingdom', 'Singapore', 'UAE', 'South Africa'],
  EDUCATIONAL: ['United States', 'United Kingdom', 'Nigeria', 'Kenya', 'India'],
  LIBRARY: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Nigeria'],
};

function bookBlob(book: Pick<Book, 'title' | 'description' | 'genre'>): string {
  return `${book.title}\n${book.description || ''}\n${book.genre}`;
}

export function inferTargetRegions(
  book: Pick<Book, 'title' | 'description' | 'genre'>,
  segment: string
): TargetRegion[] {
  const text = bookBlob(book);
  const found: string[] = [];

  for (const hint of REGION_HINTS) {
    if (hint.pattern.test(text)) {
      for (const r of hint.regions) {
        if (!found.includes(r)) found.push(r);
      }
    }
  }

  const defaults = SEGMENT_DEFAULT_REGIONS[segment] ?? SEGMENT_DEFAULT_REGIONS.AMAZON_SEARCH_SHOPPER;
  for (const r of defaults) {
    if (!found.includes(r)) found.push(r);
  }

  return found.slice(0, 6).map((region, i) => ({
    region,
    priority: (i === 0 ? 'primary' : i < 3 ? 'secondary' : 'exploratory') as TargetRegion['priority'],
    reason:
      i === 0 && REGION_HINTS.some((h) => h.pattern.test(text) && h.regions.includes(region))
        ? 'Strong topical / cultural match from the book\'s subject matter'
        : `Active ${segment.replace(/_/g, ' ').toLowerCase()} readership and discovery channels`,
  }));
}

export function buildPersonas(
  book: Pick<Book, 'title' | 'description'>,
  segment: string,
  readers: ScrapedReader[],
  regions: TargetRegion[],
  loves?: string[],
  hates?: string[]
): Persona[] {
  const primaryRegion = regions[0]?.region;
  const personas: Persona[] = [];

  // Real readers from scrape → persona cards
  for (const r of readers.slice(0, 4)) {
    let motivation = r.quote.slice(0, 160);
    
    // Enhance motivation with love/hate context if available
    if (loves && loves.length > 0) {
      motivation += ` Appreciates: ${loves.slice(0, 3).join(', ')}.`;
    }
    if (hates && hates.length > 0) {
      motivation += ` Avoids: ${hates.slice(0, 2).join(', ')}.`;
    }
    
    personas.push({
      label: r.name,
      role: `${r.source} reader / creator`,
      motivation,
      region: primaryRegion,
      evidenceSource: r.source,
      evidenceQuote: r.quote.slice(0, 220),
    });
  }

  // Segment archetype so every insight has at least 2–3 personas
  const archetypes: Record<string, Persona[]> = {
    BOOKTOK: [
      {
        label: 'Trend-driven short-form reader',
        role: 'Discovers books via TikTok / Reels',
        motivation: 'Wants a fast emotional hook and shareable takeaway',
        region: primaryRegion,
      },
    ],
    GOODREADS_POWER_READER: [
      {
        label: 'Cataloguing power reader',
        role: 'Tracks shelves, ratings, and reviews',
        motivation: 'Looks for credible reviews and clear comps before buying',
        region: primaryRegion,
      },
    ],
    AMAZON_SEARCH_SHOPPER: [
      {
        label: 'Intent search shopper',
        role: 'Buys after keyword / category search',
        motivation: 'Compares covers, Look Inside, and review volume',
        region: primaryRegion,
      },
    ],
    LIBRARY: [
      {
        label: 'Public library selector',
        role: 'Circulates short, topical nonfiction',
        motivation: 'Prefers concise works with community interest',
        region: primaryRegion,
      },
    ],
    EDUCATIONAL: [
      {
        label: 'Educator / student researcher',
        role: 'Uses books for discussion or coursework',
        motivation: 'Needs clear themes and discussion-ready angles',
        region: primaryRegion,
      },
    ],
  };

  const extra = archetypes[segment] ?? [
    {
      label: `${segment.replace(/_/g, ' ')} reader`,
      role: 'Segment-typical discoverer',
      motivation: `Engages with "${book.title}" through ${segment.replace(/_/g, ' ').toLowerCase()} channels`,
      region: primaryRegion,
    },
  ];

  for (const p of extra) {
    if (personas.length >= 5) break;
    personas.push(p);
  }

  return personas.slice(0, 5);
}

export function buildAudienceMeta(input: {
  book: Pick<Book, 'title' | 'description' | 'genre'>;
  segment: string;
  platform: string;
  readers: ScrapedReader[];
  loves?: string[];
  hates?: string[];
}): { personas: Persona[]; targetRegions: TargetRegion[] } {
  const targetRegions = inferTargetRegions(input.book, input.segment);
  const personas = buildPersonas(
    input.book,
    input.segment,
    input.readers,
    targetRegions,
    input.loves,
    input.hates
  );

  return { personas, targetRegions };
}