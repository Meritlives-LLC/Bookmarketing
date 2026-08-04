import { Router } from 'express';
import { billingController } from '../../controllers/billing.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/checkout', billingController.checkout);
router.post('/portal', billingController.portal);
router.get('/history', billingController.history);

export default router;
