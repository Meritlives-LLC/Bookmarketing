import { Router, raw } from 'express';
import { webhookController } from '../../controllers/billing.controller';

const router = Router();

router.post('/', raw({ type: 'application/json' }), webhookController.stripe);

export default router;
