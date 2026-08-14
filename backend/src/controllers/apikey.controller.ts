import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/apikey.service';

export const apiKeyController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const keys = await apiKeyService.list(req.user!.id);
      res.json({ success: true, data: keys });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const key = await apiKeyService.create(req.user!.id, req.body.name);
      res.status(201).json({ success: true, data: key });
    } catch (error) {
      next(error);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      await apiKeyService.revoke(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
