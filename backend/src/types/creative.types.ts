import { CreativeType, ReaderSegment, Platform } from '@prisma/client';

export interface GenerateCreativeInput {
  bookId: string;
  type: CreativeType;
  segment?: ReaderSegment;
  platform?: Platform;
  count?: number;
}

export interface CreativeContentBase {
  headline?: string;
  body: string;
  callToAction?: string;
}

export interface CreativeJobData {
  creativeId: string;
  bookId: string;
  type: CreativeType;
  segment?: ReaderSegment;
}
