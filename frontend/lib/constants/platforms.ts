import type { Platform, ReaderSegment } from "@/types";

export const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  AMAZON: "Amazon",
  EMAIL: "Email",
  REDDIT: "Reddit",
  YOUTUBE: "YouTube",
  GOODREADS: "Goodreads",
  PODCAST: "Podcast",
};

export const SEGMENT_LABELS: Record<ReaderSegment, string> = {
  BOOKTOK: "BookTok Readers",
  GOODREADS_POWER_READER: "Goodreads Power Readers",
  AMAZON_SEARCH_SHOPPER: "Amazon Search Shoppers",
  REDDIT_COMMUNITY: "Reddit Communities",
  BOOKTUBE_VIEWER: "BookTube Viewers",
  NEWSLETTER_SUBSCRIBER: "Newsletter Subscribers",
  FACEBOOK_GROUP: "Facebook Reading Groups",
  PODCAST_LISTENER: "Podcast Listeners",
  BOOK_CLUB: "Book Clubs",
  CORPORATE_HR: "Corporate & HR",
  EDUCATIONAL: "Educational Institutions",
  LIBRARY: "Libraries",
};
