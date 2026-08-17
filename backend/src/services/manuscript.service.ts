import { ExtractionStatus } from '@prisma/client';
import { bookRepository } from '../repositories/book.repository';
import { manuscriptRepository } from '../repositories/manuscript.repository';
import { chapterRepository } from '../repositories/chapter.repository';
import { storageService } from './storage.service';
import { AppError, omit } from '../utils/helpers';
import { logger } from '../utils/logger';
import { extractManuscriptText } from '../utils/text-extraction';
import { segmentChapters } from '../utils/chapter-segmentation';
import { resolveManuscriptFileType, validateManuscriptFileSize } from '../validators/manuscript.validator';
import { UploadedManuscriptFile } from '../types/book-video.types';
import { enqueueManuscriptExtractionJob } from '../queues/book-manuscript.queue';

const MANUSCRIPT_STORAGE_FOLDER = 'book-video/manuscripts';

export const manuscriptService = {
  /**
   * Uploads a manuscript for a book. A book has at most one manuscript —
   * uploading again replaces it wholesale (old file + chapters removed, a
   * fresh row created) per spec §3's "immutable unless explicitly replaced"
   * rule; there is no in-place edit path for manuscript content.
   */
  async upload(userId: string, bookId: string, file: UploadedManuscriptFile) {
    const book = await bookRepository.findByIdForUser(bookId, userId);
    if (!book) throw AppError.notFound('Book not found');

    const fileType = resolveManuscriptFileType(file.mimetype, file.originalname);
    validateManuscriptFileSize(file.size);

    const existing = await manuscriptRepository.findByBookId(bookId);
    if (existing) {
      await manuscriptRepository.delete(existing.id); // cascades chapters
      storageService.deleteObject(existing.fileUrl).catch((error) =>
        logger.warn('Failed to delete replaced manuscript file from storage', {
          bookId,
          manuscriptId: existing.id,
          error: (error as Error).message,
        })
      );
    }

    const key = await storageService.uploadBuffer(
      file.buffer,
      file.mimetype,
      `${MANUSCRIPT_STORAGE_FOLDER}/${bookId}`
    );

    const manuscript = await manuscriptRepository.create({
      bookId,
      originalFileName: file.originalname,
      fileType,
      fileSize: file.size,
      fileUrl: key,
      extractionStatus: ExtractionStatus.PENDING,
    });

    const enqueued = await enqueueManuscriptExtractionJob({
      manuscriptId: manuscript.id,
      bookId,
    });

    if (!enqueued) {
      // Redis not configured (e.g. local dev without it running) — still make
      // the feature usable by extracting inline rather than leaving the
      // manuscript stuck at PENDING forever.
      logger.warn('Extraction queue unavailable — processing manuscript inline', {
        manuscriptId: manuscript.id,
      });
      this.processExtraction(manuscript.id).catch((error) =>
        logger.error('Inline manuscript extraction failed', {
          manuscriptId: manuscript.id,
          error: (error as Error).message,
        })
      );
    }

    return omit(manuscript, ['fileUrl']);
  },

  /**
   * The actual extraction + chapter-segmentation pipeline. Called by the
   * BullMQ processor (production) or inline from `upload` (no-Redis dev
   * fallback) — kept as one method so both paths share identical behavior
   * and failure handling.
   */
  async processExtraction(manuscriptId: string): Promise<void> {
    const manuscript = await manuscriptRepository.findById(manuscriptId);
    if (!manuscript) {
      logger.warn('processExtraction called for missing manuscript', { manuscriptId });
      return;
    }

    await manuscriptRepository.update(manuscriptId, {
      extractionStatus: ExtractionStatus.EXTRACTING,
      processingError: null,
    });

    try {
      const buffer = await storageService.getObjectBuffer(manuscript.fileUrl);
      const extracted = await extractManuscriptText(buffer, manuscript.fileType);

      const segments = segmentChapters(extracted.text);
      if (segments.length === 0) {
        throw AppError.badRequest(
          'Manuscript text extracted but no chapters could be segmented.',
          'MANUSCRIPT_SEGMENTATION_FAILED'
        );
      }

      // Re-extraction (retry after a prior failure) must not leave duplicate chapters.
      await chapterRepository.deleteAllForManuscript(manuscriptId);
      await chapterRepository.createMany(manuscriptId, segments);

      await manuscriptRepository.update(manuscriptId, {
        extractionStatus: ExtractionStatus.COMPLETED,
        extractedWordCount: extracted.wordCount,
        extractedCharacterCount: extracted.characterCount,
        processingError: extracted.warnings.length ? extracted.warnings.join(' | ').slice(0, 1000) : null,
      });

      logger.info('Manuscript extraction completed', {
        manuscriptId,
        chapters: segments.length,
        wordCount: extracted.wordCount,
      });
    } catch (error) {
      const message = (error as Error).message || 'Unknown extraction error';
      logger.error('Manuscript extraction failed', { manuscriptId, error: message });
      await manuscriptRepository.update(manuscriptId, {
        extractionStatus: ExtractionStatus.FAILED,
        processingError: message.slice(0, 1000),
      });
    }
  },

  async getForBook(bookId: string, userId: string) {
    const manuscript = await manuscriptRepository.findByBookIdForUser(bookId, userId);
    if (!manuscript) throw AppError.notFound('No manuscript uploaded for this book');

    const chapters = await chapterRepository.findManyByManuscript(manuscript.id);
    return {
      ...omit(manuscript, ['fileUrl']),
      chapters: chapters.map((c) => ({
        id: c.id,
        chapterNumber: c.chapterNumber,
        title: c.title,
        wordCount: c.wordCount,
      })),
    };
  },

  async remove(bookId: string, userId: string) {
    const manuscript = await manuscriptRepository.findByBookIdForUser(bookId, userId);
    if (!manuscript) throw AppError.notFound('No manuscript uploaded for this book');

    await manuscriptRepository.delete(manuscript.id); // cascades chapters
    await storageService.deleteObject(manuscript.fileUrl).catch((error) =>
      logger.warn('Failed to delete manuscript file from storage', {
        manuscriptId: manuscript.id,
        error: (error as Error).message,
      })
    );
  },
};
