import { Router } from 'express';
import { authController } from '../../controllers/user.controller';
import { validate } from '../../middleware/validation.middleware';
import { authRateLimiter } from '../../middleware/rate-limit.middleware';
import { optionalAuthenticate } from '../../middleware/auth.middleware';
import { registerSchema, loginSchema } from '../../validators/user.validator';
import { z } from 'zod';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
// optionalAuthenticate (not authenticate): logout must succeed even with a
// missing/expired access token — it's still clearing cookies either way —
// but when a valid one IS present, it lets the handler revoke the user's
// refresh tokens rather than just clearing client-side cookies.
router.post('/logout', optionalAuthenticate, authController.logout);
router.post('/refresh', authController.refresh);
router.post(
  '/forgot-password',
  authRateLimiter,
  validate(z.object({ email: z.string().email() })),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate(z.object({ token: z.string(), password: z.string().min(8) })),
  authController.resetPassword
);
router.post(
  '/verify-email',
  validate(z.object({ token: z.string().min(1) })),
  authController.verifyEmail
);

export default router;
