import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface NotificationEvent {
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function consumeNotificationEvent(event: NotificationEvent): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: event.userId,
      title: event.title,
      body: event.body,
      metadata: event.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  logger.info('Notification created', { userId: event.userId, title: event.title });
}