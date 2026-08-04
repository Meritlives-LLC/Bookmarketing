import morgan from 'morgan';
import { logger } from '../utils/logger';

const stream = {
  write: (message: string) => logger.http ? logger.http(message.trim()) : logger.info(message.trim()),
};

export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream }
);
