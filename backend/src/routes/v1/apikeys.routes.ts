import { Router } from 'express';
import { apiKeyController } from '../../controllers/apikey.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createApiKeySchema } from '../../validators/apikey.validator';

const router = Router();

router.use(authenticate);

router.get('/', apiKeyController.list);
router.post('/', validate(createApiKeySchema), apiKeyController.create);
router.delete('/:id', apiKeyController.revoke);

export default router;
