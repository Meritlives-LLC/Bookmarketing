import cors from 'cors';
import { config } from '../config';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || config.cors.origin.includes(origin) || config.cors.origin.includes('*')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
});
