import { Router } from 'express';
import { queueWebhookController } from '../../controllers/webhook.controller';

const router = Router();

router.post('/', queueWebhookController.handle);

export default router;
