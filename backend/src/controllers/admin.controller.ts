import { Request, Response, NextFunction } from 'express';
import { AuditStatus } from '@prisma/client';
import { adminService } from '../services/admin.service';

export const adminController = {
  async stats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.stats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  },

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = req.query as {
        page?: number;
        limit?: number;
        search?: string;
      };
      const result = await adminService.listUsers(search, page || 1, limit || 20);
      res.json({ success: true, data: result.users, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await adminService.updateUser(req.user!, req.params.id, req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.deleteUser(req.user!.id, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async listBooks(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = req.query as {
        page?: number;
        limit?: number;
        search?: string;
      };
      const result = await adminService.listBooks(search, page || 1, limit || 20);
      res.json({ success: true, data: result.books, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async deleteBook(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.deleteBook(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async listAudits(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status } = req.query as {
        page?: number;
        limit?: number;
        status?: AuditStatus;
      };
      const result = await adminService.listAudits(status, page || 1, limit || 20);
      res.json({ success: true, data: result.audits, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },
};
