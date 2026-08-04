import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { enqueueAuditJob } from '../queues/audit.queue';

export const auditController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = await auditService.create(req.body.bookId, req.user!.id);
      await enqueueAuditJob({ auditId: audit.id, bookId: req.body.bookId });
      res.status(202).json({ success: true, data: audit });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = await auditService.getById(req.params.id, req.user!.id);
      res.json({ success: true, data: audit });
    } catch (error) {
      next(error);
    }
  },

  async regenerate(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = await auditService.getById(req.params.id, req.user!.id);
      await enqueueAuditJob({ auditId: audit.id, bookId: audit.bookId });
      res.status(202).json({ success: true, data: { message: 'Audit regeneration queued' } });
    } catch (error) {
      next(error);
    }
  },

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      // Reserved for third-party scraping providers to callback with results
      res.json({ success: true, data: { received: true } });
    } catch (error) {
      next(error);
    }
  },
};
