import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config';
import { corsMiddleware } from './middleware/cors.middleware';
import { requestLogger } from './middleware/logging.middleware';
import { generalRateLimiter } from './middleware/rate-limit.middleware';
import { notFoundHandler, errorHandler } from './middleware/error-handler.middleware';
import v1Routes from './routes/v1';
import stripeWebhookRoutes from './routes/webhooks/stripe.routes';
import queueWebhookRoutes from './routes/webhooks/queue.routes';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(compression());
  app.use(requestLogger);

  // Stripe webhook needs the raw body BEFORE json parsing
  app.use('/api/webhooks/stripe', stripeWebhookRoutes);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(generalRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  app.use(config.apiPrefix, v1Routes);
  app.use('/api/webhooks/queue', queueWebhookRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  await connectDatabase();

  try {
    await connectRedis();
  } catch (error) {
    // Redis is optional in all environments (including production on Render).
    // Rate limiting falls back to in-memory; job queues stay idle until Redis is up.
    logger.warn(
      'Redis connection failed at startup — continuing without it. ' +
        'Rate limiting will use in-memory fallback; job queues will not process until Redis is reachable.',
      { error: (error as Error).message }
    );
  }
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`BookMarketingOS API listening on port ${config.port} [${config.env}]`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });
}