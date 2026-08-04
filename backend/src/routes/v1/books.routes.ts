import { Router } from 'express';
import { bookController } from '../../controllers/book.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createBookSchema, updateBookSchema, bookListQuerySchema } from '../../validators/book.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(bookListQuerySchema, 'query'), bookController.list);
router.post('/', validate(createBookSchema), bookController.create);
router.get('/:id', bookController.getById);
router.put('/:id', validate(updateBookSchema), bookController.update);
router.delete('/:id', bookController.remove);
router.post('/:id/audit', bookController.runAudit);

export default router;
