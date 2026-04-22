'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Logo from '../components/Logo'

function SuccessContent() {
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') ?? 'quick-score'
  const sessionId = searchParams.get('session_id')
  const mockPaid = searchParams.get('paid')
  const [error, setError] = useState('')

  useEffect(() => {
    // Mock mode — skip verification
    if (mockPaid === '1') {
      window.location.replace(`/?paid=1&plan=${plan}`)
      return
    }

    // Production — verify Stripe session before granting access
    if (!sessionId) {
      setError('No payment session found.')
      return
    }

    // Detect fresh checkout vs email re-access: if we set a pending flag before
    // going to Stripe, this is a fresh checkout. Otherwise it's email re-access.
    const isCheckout = localStorage.getItem('listingiq_checkout_pending') === '1'
    localStorage.removeItem('listingiq_checkout_pending')

    fetch(`/api/verify-session?session_id=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.verified) {
          localStorage.setItem('listingiq_session_id', sessionId!)
          const urlParam = data.listingUrl ? `&url=${encodeURIComponent(data.listingUrl)}` : ''
          const photoParam = data.photoUploadId ? `&photoUploadId=${data.photoUploadId}` : ''
          const checkoutParam = isCheckout ? '&checkout=1' : ''
          // Use window.location.replace for a full page navigation so
          // the Home component's useState initializer reads the correct
          // URL params (paid=1) on first render — prevents flash of input form.
          window.location.replace(`/?paid=1&plan=${data.plan || plan}${urlParam}${photoParam}${checkoutParam}`)
        } else {
          setError(data.error || 'Payment could not be verified.')
        }
      })
      .catch(() => setError('Something went wrong verifying your payment.'))
  }, [sessionId, plan, mockPaid])

  return error ? (
    <div className="text-center">
      <p className="text-red-500 text-sm mb-3">{error}</p>
      <a href="/pricing" className="text-sm text-stone-500 hover:text-stone-600 underline">
        Back to pricing
      </a>
    </div>
  ) : (
    <div className="text-center">
      <p className="text-sm text-stone-400">Loading your report...</p>
      <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mt-4" />
    </div>
  )
}

export default function SuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F7F6F3' }}>
      <div className="max-w-2xl mx-auto px-4 text-center">
        <div className="flex justify-center mb-6">
          <Logo size={40} />
        </div>
        <Suspense fallback={
          <div className="text-center">
            <p className="text-sm text-stone-400">Loading your report...</p>
            <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mt-4" />
          </div>
        }>
          <SuccessContent />
        </Suspense>
      </div>
    </main>
  )
}
