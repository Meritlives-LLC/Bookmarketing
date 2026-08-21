import { Router } from 'express';
import { calendarController } from '../../controllers/calendar.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  createCalendarEventSchema,
  generateCalendarSchema,
  updateCalendarEventSchema,
} from '../../validators/calendar.validator';

const router = Router();

router.use(authenticate);

router.get('/', calendarController.list);
router.post('/', validate(createCalendarEventSchema), calendarController.create);
router.post('/generate', validate(generateCalendarSchema), calendarController.generate);
router.get('/:id', calendarController.getById);
router.put('/:id', validate(updateCalendarEventSchema), calendarController.update);
router.delete('/:id', calendarController.remove);
router.post('/:id/complete', calendarController.complete);

export default router;
