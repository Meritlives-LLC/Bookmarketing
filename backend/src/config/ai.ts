import OpenAI from 'openai';
import { config } from './index';

export const openai = new OpenAI({
  apiKey: config.ai.openaiApiKey || 'sk-placeholder',
});

export const AI_DEFAULT_MODEL = config.ai.defaultModel;
