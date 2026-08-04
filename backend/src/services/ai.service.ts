import { openai, AI_DEFAULT_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { Book } from '@prisma/client';

async function complete(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (error) {
    logger.error('AI completion failed', { error });
    throw error;
  }
}

async function completeJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: `${systemPrompt}\nRespond ONLY with valid JSON, no markdown fences.` },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    const text = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(text) as T;
  } catch (error) {
    logger.error('AI JSON completion failed', { error });
    throw error;
  }
}

export const aiService = {
  async generateAudienceInsight(book: Book, segment: string, platform: string) {
    return completeJson<{ summary: string; data: Record<string, unknown>; confidence: number }>(
      `You are an expert book marketing analyst specializing in reader audience research for the ${segment} segment on ${platform}.`,
      `Analyze the likely audience for this book and describe what this reader segment loves, hates, and searches for.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}\n\nReturn JSON with keys: summary (string), data (object with relevant insight fields), confidence (0-1 number).`
    );
  },

  async generateKeywordSuggestions(book: Book) {
    return completeJson<{
      keywords: Array<{ keyword: string; searchVolume: number; suggestedBid: number; competition: string }>;
    }>(
      'You are an Amazon Ads keyword research expert for book advertising.',
      `Suggest 10 high-intent Amazon search keywords for this book with estimated search volume (monthly), suggested CPC bid in USD, and competition level (low/medium/high).\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}\n\nReturn JSON with key "keywords": array of objects with keyword, searchVolume, suggestedBid, competition.`
    );
  },

  async generateCompetitorAnalysis(book: Book) {
    return completeJson<{
      competitors: Array<{
        competitorName: string;
        strengths: string[];
        weaknesses: string[];
      }>;
    }>(
      'You are a competitive book market analyst.',
      `Identify 3 comparable/competing titles for this book and analyze their strengths and weaknesses from a marketing perspective.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}\n\nReturn JSON with key "competitors": array of objects with competitorName, strengths (array), weaknesses (array).`
    );
  },

  async generateAdCopy(book: Book, segment: string, platform: string) {
    return completeJson<{ headline: string; body: string; callToAction: string }>(
      `You are a direct-response copywriter specializing in ${platform} ads for the ${segment} reader segment.`,
      `Write a scroll-stopping ad for this book targeted at ${segment} readers on ${platform}.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}\n\nReturn JSON with keys: headline, body, callToAction.`
    );
  },

  async generateTikTokScript(book: Book) {
    return complete(
      'You are a viral BookTok content creator who writes 30-45 second video scripts with strong hooks.',
      `Write a BookTok video script (hook, body, CTA) for this book.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}`
    );
  },

  async generateEmailCopy(book: Book) {
    return completeJson<{ subject: string; body: string }>(
      'You are an email marketing copywriter for book newsletters.',
      `Write a compelling promotional email for this book.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}\n\nReturn JSON with keys: subject, body.`
    );
  },

  async generateDiscussionGuide(book: Book) {
    return complete(
      'You are a book club discussion guide writer.',
      `Write 8 thoughtful discussion questions for a book club reading this book.\n\nTitle: ${book.title}\nGenre: ${book.genre}\nDescription: ${book.description}`
    );
  },

  async generateCalendar(book: Book, days: number) {
    return completeJson<{
      events: Array<{ day: number; platform: string; action: string }>;
    }>(
      'You are a book marketing campaign planner.',
      `Create a ${days}-day marketing calendar for this book across social/email/ad platforms.\n\nTitle: ${book.title}\nGenre: ${book.genre}\n\nReturn JSON with key "events": array of objects with day (number), platform, action.`
    );
  },
};
