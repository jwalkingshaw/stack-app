import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) console.warn('STRIPE_SECRET_KEY is not set. Stripe operations will fail.');
    _stripe = new Stripe(key || '', { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}
