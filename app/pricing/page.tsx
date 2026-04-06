'use client'
import { useState } from 'react'

const PLANS = [
  {
    key: 'quick-score',
    name: 'Quick Score',
    price: '$29',
    subtitle: '1 listing',
    features: [
      'Full 7-section listing audit',
      'Title + description rewrites',
      'SEO keywords & optimization tips',
      'Priority action plan',
      'PDF report download',
    ],
    cta: 'Get Quick Score · $29',
  },
  {
    key: 'full-audit',
    name: 'Full Audit',
    price: '$49',
    subtitle: '1 listing',
    popular: true,
    features: [
      'Everything in Quick Score',
      'AI photo analysis (up to 10 photos)',
      'Photo reorder + retake instructions',
      'Gallery order suggestion',
    ],
    cta: 'Get Full Audit · $49',
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  function handleCheckout(planKey: string) {
    if (process.env.NEXT_PUBLIC_USE_MOCK_API === 'true') {
      window.location.href = `/?demo=${planKey}`
      return
    }

    setLoading(planKey)
    // Redirect to Stripe checkout via GET endpoint
    window.location.href = `/api/checkout-redirect?plan=${planKey}`
  }

  return (
    <main className="min-h-screen py-20 px-4" style={{ background: '#F7F6F3' }}>
      <div className="max-w-2xl mx-auto">

        <div className="text-center mb-10">
          <div style={{ fontFamily: 'var(--font-syne)' }} className="text-xs font-bold tracking-widest text-stone-600 uppercase mb-4">
            ListingIQ · Pricing
          </div>
          <h1 style={{ fontFamily: 'var(--font-syne)' }} className="text-4xl font-bold text-stone-900 mb-3">
            Simple, honest pricing
          </h1>
          <p className="text-stone-600 text-base">
            One-time payment. No subscriptions. No account needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={`bg-white rounded-2xl p-6 text-center ${
                plan.popular ? 'border-2 border-stone-900' : 'border border-stone-200'
              }`}
            >
              {plan.popular && (
                <div style={{ fontFamily: 'var(--font-syne)' }} className="text-[10px] font-bold tracking-widest uppercase text-stone-600 mb-3">
                  Most popular
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-syne)' }} className="text-lg font-bold text-stone-900 mb-1">
                {plan.name}
              </div>
              <div className="text-stone-600 text-sm mb-4">{plan.subtitle}</div>

              <div style={{ fontFamily: 'var(--font-syne)' }} className="text-4xl font-bold text-stone-900 mb-1">
                {plan.price}
              </div>
              <div className="text-sm text-stone-600 mb-6">one time</div>

              <ul className="text-sm text-stone-600 space-y-2 mb-6 text-left">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-green-600 flex-shrink-0">&#10003;</span>{f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.key)}
                disabled={loading === plan.key}
                style={{ fontFamily: 'var(--font-syne)' }}
                className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-colors disabled:opacity-40 ${
                  plan.popular
                    ? 'bg-stone-900 text-white hover:bg-stone-700'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                }`}
              >
                {loading === plan.key
                  ? 'Redirecting...'
                  : process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'
                    ? 'Try demo →'
                    : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-stone-600 mt-8">
          Secure checkout via Stripe · No account needed
        </p>
        <p className="text-center text-xs text-stone-600 mt-3">
          Questions? <a href="https://m.me/redhiker" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">Message us on Facebook</a>
        </p>
      </div>
    </main>
  )
}
