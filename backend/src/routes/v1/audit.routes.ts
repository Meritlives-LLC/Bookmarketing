import { Router } from 'express';
import { auditController } from '../../controllers/audit.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createAuditSchema } from '../../validators/audit.validator';

const router = Router();

router.use(authenticate);

router.post('/', validate(createAuditSchema), auditController.create);
router.get('/:id', auditController.getById);
router.post('/:id/regenerate', auditController.regenerate);

export default router;
