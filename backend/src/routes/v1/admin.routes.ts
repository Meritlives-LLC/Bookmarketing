import { Router } from 'express';
import { adminController } from '../../controllers/admin.controller';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  updateUserByAdminSchema,
  adminListQuerySchema,
  adminAuditListQuerySchema,
} from '../../validators/admin.validator';

const router = Router();

// Every route below is admin-only.
router.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'));

router.get('/stats', adminController.stats);

router.get('/users', validate(adminListQuerySchema, 'query'), adminController.listUsers);
router.patch('/users/:id', validate(updateUserByAdminSchema), adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

router.get('/books', validate(adminListQuerySchema, 'query'), adminController.listBooks);
router.delete('/books/:id', adminController.deleteBook);

router.get('/audits', validate(adminAuditListQuerySchema, 'query'), adminController.listAudits);

export default router;
