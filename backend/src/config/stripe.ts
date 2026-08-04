import Stripe from 'stripe';
import { config } from './index';

export const stripe = new Stripe(config.stripe.secretKey || 'sk_test_placeholder', {
  apiVersion: '2023-10-16',
});
