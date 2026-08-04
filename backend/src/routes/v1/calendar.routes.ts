import { Router } from 'express';
import { calendarController } from '../../controllers/calendar.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', calendarController.list);
router.post('/', calendarController.create);
router.post('/generate', calendarController.generate);
router.get('/:id', calendarController.getById);
router.put('/:id', calendarController.update);
router.delete('/:id', calendarController.remove);
router.post('/:id/complete', calendarController.complete);

export default router;
