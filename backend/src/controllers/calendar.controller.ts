import { Request, Response, NextFunction } from 'express';
import { calendarService } from '../services/calendar.service';

export const calendarController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, platform, scheduledAt, creativeId, notes } = req.body;
      const event = await calendarService.create(req.user!.id, bookId, {
        platform,
        scheduledAt: new Date(scheduledAt),
        creativeId,
        notes,
      });
      res.status(201).json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },

  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, days } = req.body;
      const events = await calendarService.generatePlan(req.user!.id, bookId, days ?? 30);
      res.status(202).json({ success: true, data: events });
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookId, from, to } = req.query as { bookId: string; from?: string; to?: string };
      const events = await calendarService.list(
        bookId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined
      );
      res.json({ success: true, data: events });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await calendarService.getById(req.params.id, req.user!.id);
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await calendarService.update(req.params.id, req.user!.id, req.body);
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await calendarService.remove(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await calendarService.complete(req.params.id, req.user!.id);
      res.json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },
};
