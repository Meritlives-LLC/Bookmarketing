import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';

export const analyticsController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, from, to } = req.query as { bookId: string; from?: string; to?: string };
      const result = await analyticsService.getForBook(
        bookId,
        req.user!.id,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined
      );
      res.json({ success: true, data: result.snapshots, meta: { totals: result.totals } });
    } catch (error) {
      next(error);
    }
  },

  async export(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId } = req.query as { bookId: string };
      const result = await analyticsService.getForBook(bookId, req.user!.id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${bookId}.json"`);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, platform, date, metrics } = req.body;
      const snapshot = await analyticsService.recordSnapshot(bookId, platform, new Date(date), metrics);
      res.json({ success: true, data: snapshot });
    } catch (error) {
      next(error);
    }
  },
};