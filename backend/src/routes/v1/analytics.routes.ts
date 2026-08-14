import { Router } from 'express';
import { analyticsController } from '../../controllers/analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', analyticsController.get);
router.get('/export', analyticsController.export);
router.post('/refresh', analyticsController.refresh);
router.post('/optimize', analyticsController.optimize);

export default router;