/**
 * Stripe integration — server-side only.
 *
 * Set up in Stripe dashboard:
 * 1. Create two products: "Quick Score" and "Full Audit"
 * 2. Create a one-time price for each product
 * 3. Copy the price IDs into STRIPE_PRICE_QUICK_SCORE and STRIPE_PRICE_FULL_AUDIT env vars
 * 4. Add webhook endpoint: /api/webhook
 *    Events to listen: checkout.session.completed
 */

import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export interface PlanConfig {
  name: string
  price: number          // USD cents for display
  priceId: string        // Stripe price ID
  description: string
  popular?: boolean
}

export const PLANS: Record<string, PlanConfig> = {
  'quick-score': {
    name: 'Quick Score',
    price: 2900,
    priceId: process.env.STRIPE_PRICE_QUICK_SCORE!,
    description: 'Full listing audit',
  },
  'full-audit': {
    name: 'Full Audit',
    price: 4900,
    priceId: process.env.STRIPE_PRICE_FULL_AUDIT!,
    description: 'Full audit + photo analysis + PDF',
    popular: true,
  },
}

/** Map a Stripe price ID back to a plan key */
export function priceIdToPlanKey(priceId: string): string {
  return Object.entries(PLANS).find(([, p]) => p.priceId === priceId)?.[0] ?? 'quick-score'
}
