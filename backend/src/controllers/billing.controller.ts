import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { billingService } from '../services/billing.service';
import { stripe } from '../config/stripe';
import { config } from '../config';
import { AppError } from '../utils/helpers';

export const billingController = {
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await billingService.createCheckoutSession(req.user!.id, req.body.priceId);
      res.json({ success: true, data: { url: session.url } });
    } catch (error) {
      next(error);
    }
  },

  async portal(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await billingService.createPortalSession(req.user!.id);
      res.json({ success: true, data: { url: session.url } });
    } catch (error) {
      next(error);
    }
  },

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await billingService.getHistory(req.user!.id);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  },
};

export const webhookController = {
  async stripe(req: Request, res: Response, next: NextFunction) {
    const signature = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch (error) {
      return next(AppError.badRequest(`Webhook signature verification failed: ${(error as Error).message}`));
    }

    try {
      await billingService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error) {
      next(error);
    }
  },
};
