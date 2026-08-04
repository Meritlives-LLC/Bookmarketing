import winston from 'winston';
import { loggerConfig } from '../config/logging';

export const logger = winston.createLogger(loggerConfig);
