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

// Lazy initialization — reads env vars at runtime, not build time
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    })
  }
  return _stripe
}

// Keep backward compat — but as a getter
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as Record<string | symbol, unknown>)[prop]
  },
})

export interface PlanConfig {
  name: string
  price: number          // USD cents for display
  priceId: string        // Stripe price ID
  description: string
  popular?: boolean
}

export function getPlans(): Record<string, PlanConfig> {
  return {
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
}

// For backward compat — lazy proxy
export const PLANS = new Proxy({} as Record<string, PlanConfig>, {
  get(_, prop) {
    return getPlans()[prop as string]
  },
  ownKeys() {
    return Object.keys(getPlans())
  },
  getOwnPropertyDescriptor(_, prop) {
    const plans = getPlans()
    if (prop in plans) {
      return { configurable: true, enumerable: true, value: plans[prop as string] }
    }
    return undefined
  },
})

/** Map a Stripe price ID back to a plan key */
export function priceIdToPlanKey(priceId: string): string {
  const plans = getPlans()
  return Object.entries(plans).find(([, p]) => p.priceId === priceId)?.[0] ?? 'quick-score'
}
