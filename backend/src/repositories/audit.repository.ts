import { Audit, AuditStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  AudienceInsightPayload,
  KeywordSuggestionPayload,
  CompetitorAnalysisPayload,
} from '../types/audit.types';

export const auditRepository = {
  create(bookId: string): Promise<Audit> {
    return prisma.audit.create({ data: { bookId } });
  },

  findById(id: string) {
    return prisma.audit.findUnique({
      where: { id },
      include: {
        audienceInsights: true,
        keywordSuggestions: true,
        competitorAnalyses: true,
        book: true,
      },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.audit.findFirst({
      where: { id, book: { userId } },
      include: {
        audienceInsights: true,
        keywordSuggestions: true,
        competitorAnalyses: true,
        book: true,
      },
    });
  },

  updateStatus(id: string, status: AuditStatus, extra: Prisma.AuditUpdateInput = {}): Promise<Audit> {
    return prisma.audit.update({ where: { id }, data: { status, ...extra } });
  },

  markCompleted(id: string): Promise<Audit> {
    return prisma.audit.update({
      where: { id },
      data: { status: AuditStatus.COMPLETED, completedAt: new Date() },
    });
  },

  markFailed(id: string, errorMessage: string): Promise<Audit> {
    return prisma.audit.update({
      where: { id },
      data: { status: AuditStatus.FAILED, errorMessage },
    });
  },

  addAudienceInsights(auditId: string, insights: AudienceInsightPayload[]) {
    return prisma.audienceInsight.createMany({
      data: insights.map((i) => ({ ...i, auditId })),
    });
  },

  addKeywordSuggestions(auditId: string, keywords: KeywordSuggestionPayload[]) {
    return prisma.keywordSuggestion.createMany({
      data: keywords.map((k) => ({ ...k, auditId })),
    });
  },

  addCompetitorAnalyses(auditId: string, competitors: CompetitorAnalysisPayload[]) {
    return prisma.competitorAnalysis.createMany({
      data: competitors.map((c) => ({ ...c, auditId })),
    });
  },
};
