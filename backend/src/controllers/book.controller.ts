import { Request, Response, NextFunction } from 'express';
import { bookService } from '../services/book.service';
import { auditService } from '../services/audit.service';
import { enqueueAuditJob } from '../queues/audit.queue';
import { logger } from '../utils/logger';

export const bookController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const book = await bookService.create(req.user!.id, req.body);

      // Auto-start audience audit in the background — do not fail book creation
      let auditId: string | null = null;
      try {
        const audit = await auditService.create(book.id, req.user!.id);
        auditId = audit.id;
        await enqueueAuditJob({ auditId: audit.id, bookId: book.id });
        logger.info('Auto-audit enqueued on book create', {
          bookId: book.id,
          auditId: audit.id,
        });
      } catch (err) {
        logger.warn('Auto-audit failed to enqueue (book still created)', {
          bookId: book.id,
          error: (err as Error).message,
        });
      }

      res.status(201).json({
        success: true,
        data: {
          ...book,
          auditId,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, genre, search } = req.query as {
        page?: string;
        limit?: string;
        genre?: string;
        search?: string;
      };
      const result = await bookService.list(
        req.user!.id,
        { genre: genre as never, search },
        Number(page) || 1,
        Number(limit) || 20
      );
      res.json({ success: true, data: result.books, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const book = await bookService.getById(req.params.id, req.user!.id);
      res.json({ success: true, data: book });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const book = await bookService.update(req.params.id, req.user!.id, req.body);
      res.json({ success: true, data: book });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await bookService.remove(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async runAudit(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = await auditService.create(req.params.id, req.user!.id);
      await enqueueAuditJob({ auditId: audit.id, bookId: req.params.id });
      res.status(202).json({ success: true, data: audit });
    } catch (error) {
      next(error);
    }
  },
};