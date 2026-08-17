import { Router } from 'express';
import authRoutes from './auth.routes';
import bookRoutes from './books.routes';
import manuscriptRoutes from './manuscript.routes';
import auditRoutes from './audit.routes';
import creativeRoutes from './creatives.routes';
import calendarRoutes from './calendar.routes';
import analyticsRoutes from './analytics.routes';
import userRoutes from './user.routes';
import billingRoutes from './billing.routes';
import apiKeysRoutes from './apikeys.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/books', bookRoutes);
// Dedicated book-video routes, mounted under the same /books prefix
// (paths are /books/:bookId/manuscript/*, which never collide with
// books.routes.ts's own /:id-shaped paths).
router.use('/books', manuscriptRoutes);
router.use('/audit', auditRoutes);
router.use('/creatives', creativeRoutes);
router.use('/calendar', calendarRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/user', userRoutes);
router.use('/billing', billingRoutes);
router.use('/api-keys', apiKeysRoutes);

export default router;
