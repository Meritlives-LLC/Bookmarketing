import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

export const notificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ success: true, data: notifications });
    } catch (error) {
      next(error);
    }
  },

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const notification = await prisma.notification.updateMany({
        where: { id: req.params.id, userId: req.user!.id },
        data: { read: true },
      });
      res.json({ success: true, data: { updated: notification.count } });
    } catch (error) {
      next(error);
    }
  },
};

