export type UserRole = "AUTHOR" | "ADMIN" | "SUPER_ADMIN";
export type SubscriptionPlan = "FREE" | "STARTER" | "PRO" | "AGENCY";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "INCOMPLETE";

export type BookGenre =
  | "ROMANCE"
  | "ROMANTASY"
  | "FANTASY"
  | "SCI_FI"
  | "THRILLER"
  | "MYSTERY"
  | "YA"
  | "LITERARY_FICTION"
  | "HISTORICAL_FICTION"
  | "NON_FICTION"
  | "MEMOIR"
  | "SELF_HELP"
  | "BUSINESS"
  | "HORROR"
  | "LITRPG"
  | "OTHER";

export type AuditStatus = "PENDING" | "SCRAPING" | "ANALYZING" | "COMPLETED" | "FAILED";
export type ReaderSegment =
  | "BOOKTOK"
  | "GOODREADS_POWER_READER"
  | "AMAZON_SEARCH_SHOPPER"
  | "REDDIT_COMMUNITY"
  | "BOOKTUBE_VIEWER"
  | "NEWSLETTER_SUBSCRIBER"
  | "FACEBOOK_GROUP"
  | "PODCAST_LISTENER"
  | "BOOK_CLUB"
  | "CORPORATE_HR"
  | "EDUCATIONAL"
  | "LIBRARY";

export type CreativeType =
  | "IMAGE_AD"
  | "VIDEO_AD"
  | "TIKTOK_VIDEO"
  | "EMAIL_COPY"
  | "AMAZON_KEYWORDS"
  | "LANDING_PAGE"
  | "PODCAST_PITCH"
  | "DISCUSSION_GUIDE"
  | "REDDIT_POST"
  | "YOUTUBE_SCRIPT";

export type CreativeStatus = "DRAFT" | "GENERATING" | "READY" | "PUBLISHED" | "ARCHIVED" | "FAILED";
export type Platform =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "TIKTOK"
  | "AMAZON"
  | "EMAIL"
  | "REDDIT"
  | "YOUTUBE"
  | "GOODREADS"
  | "PODCAST";

export type CalendarEventStatus = "SCHEDULED" | "PUBLISHED" | "FAILED" | "CANCELED";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  emailVerified: boolean;
  avatarUrl?: string | null;
  credits: number;
  createdAt: string;
  lastLoginAt?: string | null;
  subscription?: Subscription | null;
}

export interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Book {
  id: string;
  userId: string;
  title: string;
  subtitle?: string | null;
  description: string;
  genre: BookGenre;
  coverImageUrl?: string | null;
  amazonUrl?: string | null;
  goodreadsUrl?: string | null;
  asin?: string | null;
  isbn?: string | null;
  publishedAt?: string | null;
  price?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: { audits: number; creatives: number };
}

export interface Audit {
  id: string;
  bookId: string;
  status: AuditStatus;
  requestedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  audienceInsights?: AudienceInsight[];
  keywordSuggestions?: KeywordSuggestion[];
  competitorAnalyses?: CompetitorAnalysis[];
}

export interface AudienceInsight {
  id: string;
  segment: ReaderSegment;
  platform: Platform;
  summary: string;
  data: Record<string, unknown>;
  confidence: number;
}

export interface KeywordSuggestion {
  id: string;
  keyword: string;
  searchVolume?: number | null;
  suggestedBid?: number | null;
  competition?: string | null;
  platform: Platform;
}

export interface CompetitorAnalysis {
  id: string;
  competitorName: string;
  competitorAsin?: string | null;
  strengths: string[];
  weaknesses: string[];
  priceComparison?: Record<string, unknown> | null;
}

export interface Creative {
  id: string;
  bookId: string;
  type: CreativeType;
  segment?: ReaderSegment | null;
  platform?: Platform | null;
  status: CreativeStatus;
  title?: string | null;
  content: Record<string, unknown>;
  assetUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  bookId: string;
  creativeId?: string | null;
  platform: Platform;
  scheduledAt: string;
  status: CalendarEventStatus;
  notes?: string | null;
  completedAt?: string | null;
}

export interface AnalyticsSnapshot {
  id: string;
  bookId: string;
  platform: Platform;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code?: string };
  meta?: { page?: number; limit?: number; total?: number };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
