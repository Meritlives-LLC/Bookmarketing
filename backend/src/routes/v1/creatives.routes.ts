import { Router } from 'express';
import { creativeController } from '../../controllers/creative.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { aiGenerationRateLimiter } from '../../middleware/rate-limit.middleware';
import { generateCreativeSchema } from '../../validators/creative.validator';

const router = Router();

router.use(authenticate);

router.get('/', creativeController.list);
router.post('/generate', aiGenerationRateLimiter, validate(generateCreativeSchema), creativeController.generate);
router.get('/:id', creativeController.getById);
router.put('/:id', creativeController.update);
router.delete('/:id', creativeController.remove);
router.get('/:id/download', creativeController.download);

export default router;
