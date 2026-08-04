import winston from 'winston';
import { config } from './index';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}]: ${message}${metaStr}`;
  })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const loggerConfig: winston.LoggerOptions = {
  level: config.logLevel,
  format: config.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: config.isTest,
};
