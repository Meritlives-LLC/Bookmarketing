import { Request, Response, NextFunction } from 'express';
import { creativeService } from '../services/creative.service';

export const creativeController = {
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const creative = await creativeService.create(req.user!.id, req.body);
      res.status(202).json({ success: true, data: creative });
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, page, limit } = req.query as { bookId: string; page?: string; limit?: string };
      const result = await creativeService.list(req.user!.id, bookId, Number(page) || 1, Number(limit) || 20);
      res.json({ success: true, data: result.creatives, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const creative = await creativeService.getById(req.params.id, req.user!.id);
      res.json({ success: true, data: creative });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const creative = await creativeService.update(req.params.id, req.user!.id, req.body);
      res.json({ success: true, data: creative });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await creativeService.remove(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async download(req: Request, res: Response, next: NextFunction) {
    try {
      const creative = await creativeService.getById(req.params.id, req.user!.id);
      const body =
        typeof creative.content === 'object'
          ? JSON.stringify(creative.content, null, 2)
          : String(creative.content);
      const safeName = (creative.title || creative.type).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName || 'creative'}.json"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  },
};