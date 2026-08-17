import { Request, Response, NextFunction } from 'express';
import { manuscriptService } from '../services/manuscript.service';
import { AppError } from '../utils/helpers';

export const manuscriptController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw AppError.badRequest('No manuscript file provided (form field name: "manuscript").');
      }
      const manuscript = await manuscriptService.upload(req.user!.id, req.params.bookId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      res.status(202).json({ success: true, data: manuscript });
    } catch (error) {
      next(error);
    }
  },

  async getForBook(req: Request, res: Response, next: NextFunction) {
    try {
      const manuscript = await manuscriptService.getForBook(req.params.bookId, req.user!.id);
      res.json({ success: true, data: manuscript });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await manuscriptService.remove(req.params.bookId, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
