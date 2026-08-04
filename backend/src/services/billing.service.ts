import { stripe } from '../config/stripe';
import { config } from '../config';
import { prisma } from '../config/database';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../utils/helpers';
import { logger } from '../utils/logger';
import Stripe from 'stripe';

const PRICE_TO_PLAN: Record<string, 'STARTER' | 'PRO' | 'AGENCY'> = {
  [config.stripe.prices.starter]: 'STARTER',
  [config.stripe.prices.pro]: 'PRO',
  [config.stripe.prices.agency]: 'AGENCY',
};

export const billingService = {
  async createCheckoutSession(userId: string, priceId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound('User not found');

    let subscription = await prisma.subscription.findUnique({ where: { userId } });
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId },
      });
      customerId = customer.id;
      subscription = await prisma.subscription.upsert({
        where: { userId },
        create: { userId, stripeCustomerId: customerId },
        update: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.frontendUrl}/dashboard/settings/billing?success=true`,
      cancel_url: `${config.frontendUrl}/dashboard/settings/billing?canceled=true`,
    });

    return session;
  },

  async createPortalSession(userId: string) {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription?.stripeCustomerId) {
      throw AppError.badRequest('No billing account found for this user');
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${config.frontendUrl}/dashboard/settings/billing`,
    });
    return session;
  },

  async getHistory(userId: string) {
    return prisma.billingEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  },

  async handleWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
        if (sub && session.subscription) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { stripeSubscriptionId: session.subscription as string, status: 'ACTIVE' },
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const priceId = stripeSub.items.data[0]?.price.id;
        const plan = PRICE_TO_PLAN[priceId ?? ''] ?? 'FREE';
        const record = await prisma.subscription.findFirst({
          where: { stripeCustomerId: stripeSub.customer as string },
        });
        if (record) {
          await prisma.subscription.update({
            where: { id: record.id },
            data: {
              plan,
              status: stripeSub.status.toUpperCase() as never,
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const record = await prisma.subscription.findFirst({
          where: { stripeCustomerId: stripeSub.customer as string },
        });
        if (record) {
          await prisma.subscription.update({
            where: { id: record.id },
            data: { status: 'CANCELED', plan: 'FREE' },
          });
        }
        break;
      }
      default:
        logger.info('Unhandled Stripe webhook event', { type: event.type });
    }
  },
};
