import { Router } from 'express';
import authRoutes from './auth.routes';
import bookRoutes from './books.routes';
import auditRoutes from './audit.routes';
import creativeRoutes from './creatives.routes';
import calendarRoutes from './calendar.routes';
import analyticsRoutes from './analytics.routes';
import userRoutes from './user.routes';
import billingRoutes from './billing.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/books', bookRoutes);
router.use('/audit', auditRoutes);
router.use('/creatives', creativeRoutes);
router.use('/calendar', calendarRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/user', userRoutes);
router.use('/billing', billingRoutes);

export default router;
