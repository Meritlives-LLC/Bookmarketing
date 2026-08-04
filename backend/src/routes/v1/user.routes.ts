import { Router } from 'express';
import { userController } from '../../controllers/user.controller';
import { notificationController } from '../../controllers/webhook.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', userController.me);
router.put('/', userController.update);
router.get('/credits', userController.credits);
router.get('/notifications', notificationController.list);
router.put('/notifications/:id', notificationController.markRead);

export default router;
