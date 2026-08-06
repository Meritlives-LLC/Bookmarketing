import { Worker } from 'bullmq';
import { requireBullConnection } from '../queues/connection';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

interface EmailJobData {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function start() {
  const connection = requireBullConnection();

  const worker = new Worker<EmailJobData>(
    'email-delivery',
    async (job) => {
      await emailService.send(job.data.to, job.data.subject, job.data.text, job.data.html);
    },
    {
      connection: connection.connection,
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => logger.info('Email job completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Email job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('Email worker started');
}

start().catch((error) => {
  logger.error('Failed to start email worker', { error: (error as Error).message });
  process.exit(1);
});