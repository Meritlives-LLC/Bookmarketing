import { ReaderSegment, Platform } from '@prisma/client';

export interface CreateAuditInput {
  bookId: string;
}

export interface AudienceInsightPayload {
  segment: ReaderSegment;
  platform: Platform;
  summary: string;
  data: Record<string, unknown>;
  confidence: number;
}

export interface KeywordSuggestionPayload {
  keyword: string;
  searchVolume?: number;
  suggestedBid?: number;
  competition?: string;
  platform: Platform;
}

export interface CompetitorAnalysisPayload {
  competitorName: string;
  competitorAsin?: string;
  strengths: string[];
  weaknesses: string[];
  priceComparison?: Record<string, unknown>;
}

export interface AuditJobData {
  auditId: string;
  bookId: string;
}
