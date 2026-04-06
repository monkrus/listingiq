'use client'
import { useState, useEffect } from 'react'
import { ReportData, ListingInput } from './lib/types'
import { isValidAirbnbUrl } from './lib/validation'
import { DEMO_LISTING } from './lib/demo'
import Report from './components/Report'
import { APP_VERSION } from './lib/version'
import PhotoUploadStep from './components/PhotoUploadStep'
import { PhotoAnalysisResult } from './api/analyze-photos/route'
import { savePendingPhotos, getPendingPhotos, clearPendingPhotos } from './lib/photo-db'

const LOADING_STEPS = [
  'Connecting to Airbnb...',
  'Reading listing details...',
  'Extracting photos, amenities & reviews...',
  'Analyzing title & description...',
  'Evaluating guest persona fit...',
  'Checking amenity competitiveness...',
  'Reviewing guest sentiment...',
  'Generating SEO keywords...',
  'Writing optimized description...',
  'Compiling your report...',
]

const LOADING_STEPS_WITH_PHOTOS = [
  ...LOADING_STEPS,
  'Analyzing your listing photos...',
  'Scoring each photo...',
  'Generating photo report...',
]

type Step = 'input' | 'plan' | 'photos' | 'loading' | 'report'

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepIndex, setStepIndex] = useState(-1)
  const [report, setReport] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [activePlan, setActivePlan] = useState<string>('quick-score')
  const [isDemo, setIsDemo] = useState(false)
  const [step, setStep] = useState<Step>('input')
  const [selectedPlan, setSelectedPlan] = useState<string>('full-audit')
  const [photoUploadId, setPhotoUploadId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [initialPhotoResults, setInitialPhotoResults] = useState<PhotoAnalysisResult | null>(null)
  const [initialPhotoPreviews, setInitialPhotoPreviews] = useState<string[] | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Returning from Stripe payment or email re-access
    if (params.get('paid') === '1') {
      setIsPaid(true)
      const planParam = params.get('plan')
      if (planParam && ['quick-score', 'full-audit'].includes(planParam)) {
        setActivePlan(planParam)
      }
      const isCheckout = params.get('checkout') === '1'

      // Check for saved report — reuse if same plan (don't show Quick Score for Full Audit)
      const savedPlan = localStorage.getItem('listingiq_plan')
      const saved = localStorage.getItem('listingiq_report')
      if (saved && savedPlan === planParam) {
        try {
          setReport(JSON.parse(saved))
          // Restore photo results from localStorage
          const savedPhotos = localStorage.getItem('listingiq_photo_results')
          const savedPreviews = localStorage.getItem('listingiq_photo_previews')
          if (savedPhotos) setInitialPhotoResults(JSON.parse(savedPhotos))
          if (savedPreviews) setInitialPhotoPreviews(JSON.parse(savedPreviews))
          return
        } catch {}
      }

      const urlParam = params.get('url')
      const photoUploadParam = params.get('photoUploadId')

      // Fresh checkout: clear stale localStorage. Email re-access: keep existing data.
      if (isCheckout) {
        localStorage.removeItem('listingiq_report')
        localStorage.removeItem('listingiq_plan')
        localStorage.removeItem('listingiq_photo_results')
        localStorage.removeItem('listingiq_photo_previews')
      }

      // Email re-access: try Supabase cache first for instant display (no loading screen)
      const sid = localStorage.getItem('listingiq_session_id')
      if (!isCheckout && sid) {
        ;(async () => {
          try {
            const cacheRes = await fetch(`/api/cached-report?session_id=${encodeURIComponent(sid)}`)
            const cacheData = await cacheRes.json()
            if (cacheData.found) {
              setReport(cacheData.reportData as any)
              if (cacheData.listingUrl) setUrl(cacheData.listingUrl)
              if (cacheData.photoResults) setInitialPhotoResults(cacheData.photoResults)
              if (cacheData.photoPreviews) setInitialPhotoPreviews(cacheData.photoPreviews)
              localStorage.setItem('listingiq_report', JSON.stringify(cacheData.reportData))
              localStorage.setItem('listingiq_plan', cacheData.plan || planParam || 'quick-score')
              if (cacheData.listingUrl) localStorage.setItem('listingiq_url', cacheData.listingUrl)
              if (cacheData.photoResults) localStorage.setItem('listingiq_photo_results', JSON.stringify(cacheData.photoResults))
              if (cacheData.photoPreviews) localStorage.setItem('listingiq_photo_previews', JSON.stringify(cacheData.photoPreviews))
              return
            }
          } catch {}
          // Fallback: re-analyze if cache miss
          const savedUrl = urlParam || localStorage.getItem('listingiq_url')
          if (savedUrl) {
            setUrl(savedUrl)
            localStorage.setItem('listingiq_url', savedUrl)
            if (photoUploadParam) {
              setPhotoUploadId(photoUploadParam)
            }
            analyze({ url: savedUrl, reaccess: true }, photoUploadParam || null, planParam || 'quick-score')
          }
        })()
        return
      }

      // Fresh checkout: run analysis
      const savedUrl = urlParam || localStorage.getItem('listingiq_url')
      if (savedUrl) {
        setUrl(savedUrl)
        localStorage.setItem('listingiq_url', savedUrl)
        if (photoUploadParam) {
          setPhotoUploadId(photoUploadParam)
        }
        analyze({ url: savedUrl, reaccess: false }, photoUploadParam || null, planParam || 'quick-score')
      }
      return
    }

    // Auto-launch demo for a specific plan from pricing page
    const demoPlan = params.get('demo')
    if (demoPlan && ['quick-score', 'full-audit'].includes(demoPlan)) {
      setActivePlan(demoPlan)
      setIsPaid(true)
      setIsDemo(true)
      analyze(DEMO_LISTING, null, demoPlan)
      return
    }

    // Restore saved report from localStorage (returning user, tab was closed)
    const savedReport = localStorage.getItem('listingiq_report')
    if (savedReport) {
      try {
        const parsed = JSON.parse(savedReport)
        setReport(parsed)
        const savedUrl = localStorage.getItem('listingiq_url')
        if (savedUrl) setUrl(savedUrl)
        return
      } catch {}
    }

    // Restore URL from query param (e.g. cancel redirect)
    const urlParam = params.get('url')
    if (urlParam) setUrl(urlParam)
  }, [])

  function savePhotoResultsToStorage(photoResults: PhotoAnalysisResult, photoPreviews?: string[] | null) {
    try {
      localStorage.setItem('listingiq_photo_results', JSON.stringify(photoResults))
      if (photoPreviews) localStorage.setItem('listingiq_photo_previews', JSON.stringify(photoPreviews))
    } catch {}
  }

  async function animateSteps(withPhotos: boolean) {
    const steps = withPhotos ? LOADING_STEPS_WITH_PHOTOS : LOADING_STEPS
    for (let i = 0; i < steps.length; i++) {
      setStepIndex(i)
      await new Promise(r => setTimeout(r, i < 3 ? 3000 : 7000))
    }
  }

  async function analyze(payload: ListingInput & { reaccess?: boolean }, uploadId?: string | null, planOverride?: string) {
    setError('')
    setLoading(true)
    setStep('loading')
    setReport(null)
    setInitialPhotoResults(null)
    setInitialPhotoPreviews(null)

    const plan = planOverride || activePlan
    // Check for user-uploaded photos
    const hasUserPhotos = !!uploadId || (plan === 'full-audit' && !!(await getPendingPhotos()))
    // Full Audit always analyzes photos (listing photos if no user uploads)
    const willAnalyzePhotos = hasUserPhotos || plan === 'full-audit'
    animateSteps(willAnalyzePhotos)

    try {
      // 1. Run text analysis
      const sessionId = localStorage.getItem('listingiq_session_id')
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sessionId, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      // 2. For Full Audit, run photo analysis
      if (plan === 'full-audit') {
        // Check if Supabase cached report already includes photo results
        if (data.cachedPhotoResults) {
          setInitialPhotoResults(data.cachedPhotoResults)
          if (data.cachedPhotoPreviews) setInitialPhotoPreviews(data.cachedPhotoPreviews)
          savePhotoResultsToStorage(data.cachedPhotoResults, data.cachedPhotoPreviews)
        } else {
          try {
            const listingContext = {
              title: data.titleSuggestions?.[0] || '',
              amenities: data.amenityHaves || [],
              missingPhotos: data.missingPhotos || [],
            }

            let photoRes: Response | null = null

            // Priority 1: Try server-side photo store (user uploaded before payment)
            if (uploadId) {
              photoRes = await fetch('/api/analyze-photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId, sessionId, listingContext }),
              })
            }

            // Priority 2: If server photos expired, try IndexedDB
            if ((!photoRes || (!photoRes.ok && photoRes.status === 410)) && hasUserPhotos) {
              console.warn('[analyze] Trying IndexedDB fallback...')
              const savedFiles = await getPendingPhotos()
              if (savedFiles?.length) {
                const form = new FormData()
                savedFiles.forEach(f => form.append('photos', f))
                form.append('sessionId', sessionId || '')
                form.append('listingContext', JSON.stringify(listingContext))
                photoRes = await fetch('/api/analyze-photos', { method: 'POST', body: form })
              }
            }

            // Priority 3: Auto-analyze listing photos from scraper
            if (!photoRes && data.photoUrls?.length) {
              console.log('[analyze] Auto-analyzing listing photos from scraper URLs...')
              photoRes = await fetch('/api/analyze-photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoUrls: data.photoUrls, sessionId, listingContext }),
              })
            }

            if (photoRes) {
              const photoData = await photoRes.json()
              if (photoRes.ok) {
                setInitialPhotoResults(photoData)
                let photoPreviews: string[] | null = null
                if (photoData.previews) {
                  photoPreviews = photoData.previews
                  setInitialPhotoPreviews(photoData.previews)
                } else if (hasUserPhotos) {
                  const savedFiles = await getPendingPhotos()
                  if (savedFiles?.length) {
                    photoPreviews = await Promise.all(savedFiles.map(f =>
                      new Promise<string>(resolve => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(reader.result as string)
                        reader.readAsDataURL(f)
                      })
                    ))
                    setInitialPhotoPreviews(photoPreviews)
                  }
                }
                savePhotoResultsToStorage(photoData, photoPreviews)
                clearPendingPhotos()
              } else {
                console.warn('[analyze] Photo analysis failed:', photoData.error)
              }
            }
          } catch (photoErr) {
            console.warn('[analyze] Photo analysis error:', photoErr)
          }
        }
      }

      setReport(data)
      setStep('report')
      if (!isDemo) {
        localStorage.setItem('listingiq_report', JSON.stringify(data))
        localStorage.setItem('listingiq_plan', plan)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('input')
    } finally {
      setLoading(false)
      setStepIndex(-1)
    }
  }

  function handleSubmit() {
    const trimmed = url.trim()
    if (!trimmed) { setError('Please enter an Airbnb listing URL.'); return }
    if (!isValidAirbnbUrl(trimmed)) {
      setError('Please enter a valid Airbnb listing URL (e.g., https://airbnb.com/rooms/12345).')
      return
    }
    localStorage.setItem('listingiq_url', trimmed)
    if (isPaid) {
      analyze({ url: trimmed })
      return
    }
    setStep('plan')
  }

  function handlePlanSelect(planKey: string) {
    setSelectedPlan(planKey)
    setActivePlan(planKey)
    localStorage.setItem('listingiq_url', url.trim())

    // Full Audit: show photo upload step first
    if (planKey === 'full-audit') {
      setStep('photos')
      return
    }

    // Quick Score: go straight to payment
    goToPayment(planKey)
  }

  async function handlePhotosContinue(files: File[], _previews: string[]) {
    setPhotoUploading(true)
    try {
      // Save photos to IndexedDB so they survive the Stripe redirect
      await savePendingPhotos(files)

      // Also upload to server as primary path
      const form = new FormData()
      files.forEach(f => form.append('photos', f))
      const res = await fetch('/api/upload-photos', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setPhotoUploadId(data.uploadId)
      goToPayment('full-audit', data.uploadId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Photo upload failed')
    } finally {
      setPhotoUploading(false)
    }
  }

  function goToPayment(planKey: string, uploadId?: string) {
    // In mock mode, skip payment and go straight to analysis
    if (process.env.NEXT_PUBLIC_USE_MOCK_API === 'true') {
      setIsPaid(true)
      analyze({ url: url.trim() }, uploadId, planKey)
      return
    }
    // Production: redirect to Stripe checkout
    localStorage.setItem('listingiq_checkout_pending', '1')
    const uploadParam = uploadId ? `&uploadId=${uploadId}` : ''
    window.location.href = `/api/checkout-redirect?plan=${planKey}&url=${encodeURIComponent(url.trim())}${uploadParam}`
  }

  function handleDemo() {
    setIsPaid(true)
    setIsDemo(true)
    setActivePlan('full-audit')
    analyze(DEMO_LISTING, null, 'full-audit')
  }

  function reset() {
    setReport(null)
    setUrl('')
    setError('')
    setIsDemo(false)
    setIsPaid(false)
    setActivePlan('quick-score')
    setStep('input')
    setPhotoUploadId(null)
    setInitialPhotoResults(null)
    setInitialPhotoPreviews(null)
    localStorage.removeItem('listingiq_report')
    localStorage.removeItem('listingiq_plan')
    localStorage.removeItem('listingiq_url')
    localStorage.removeItem('listingiq_session_id')
    localStorage.removeItem('listingiq_photo_results')
    localStorage.removeItem('listingiq_photo_previews')
  }

  // Report view
  if (report) return (
    <main className="min-h-screen py-12" style={{ background: '#F7F6F3' }}>
      <div className="max-w-2xl mx-auto px-4 mb-6 text-center">
        <div style={{ fontFamily: 'var(--font-syne)' }} className="text-xs font-bold tracking-widest text-stone-600 uppercase mb-2">
          ListingIQ · Airbnb Optimizer
        </div>
        <button onClick={reset} className="text-sm text-stone-500 hover:text-stone-700 underline">
          Analyze another listing
        </button>
      </div>
      <Report
        data={report}
        onReset={reset}
        plan={activePlan}
        isDemo={isDemo}
        listingUrl={url}
        initialPhotoResults={initialPhotoResults}
        initialPhotoPreviews={initialPhotoPreviews}
      />
    </main>
  )

  const loadingSteps = photoUploadId ? LOADING_STEPS_WITH_PHOTOS : LOADING_STEPS

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: '#F7F6F3' }}>
      <div className="w-full max-w-xl">

        <div className="text-center mb-10">
          <div style={{ fontFamily: 'var(--font-syne)' }} className="text-xs font-bold tracking-widest text-stone-600 uppercase mb-5">
            ListingIQ · Airbnb Optimizer
          </div>
          <h1 style={{ fontFamily: 'var(--font-syne)' }} className="text-4xl font-bold text-stone-900 leading-snug mb-3">
            Score & optimize<br />your Airbnb listing
          </h1>
          <p className="text-stone-600 text-base leading-relaxed">
            AI-powered analysis of your title, photos, description,<br />
            amenities & booking conversion.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">

          {/* Step 1: URL input */}
          {step === 'input' && (
            <>
              <p className="text-sm text-stone-500 mb-2 font-medium">Paste your Airbnb listing link below</p>
              <div className="flex gap-2.5 mb-4">
                <input
                  type="text"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="https://airbnb.com/rooms/..."
                  className="flex-1 h-11 px-4 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 outline-none focus:border-stone-400 placeholder-stone-300"
                />
                <button
                  onClick={handleSubmit}
                  style={{ fontFamily: 'var(--font-syne)' }}
                  className="h-11 px-5 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 transition-colors whitespace-nowrap tracking-wide"
                >
                  Analyze
                </button>
              </div>
              {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}
              <p className="text-xs text-stone-600">
                From $29 · no account needed · <button onClick={handleDemo} className="text-blue-500 underline hover:text-blue-700">Try demo</button>
              </p>
            </>
          )}

          {/* Step 2: Plan selection */}
          {step === 'plan' && (
            <div>
              <div className="text-center mb-4">
                <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900 mb-1">
                  Choose your report
                </p>
                <p className="text-xs text-stone-600">{(() => { try { const u = new URL(url); return u.origin + u.pathname } catch { return url } })()}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  {
                    key: 'quick-score',
                    name: 'Quick Score',
                    price: '$29',
                    features: ['Full 7-section audit', 'Title + description rewrites', 'SEO keywords & tips', 'PDF report download'],
                  },
                  {
                    key: 'full-audit',
                    name: 'Full Audit',
                    price: '$49',
                    popular: true,
                    features: ['Everything in Quick Score', 'AI photo analysis (10 photos)', 'Photo reorder + retake tips', 'Gallery order suggestion'],
                  },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPlan(p.key)}
                    className={`rounded-xl p-4 text-center text-left transition-all ${
                      selectedPlan === p.key
                        ? 'border-2 border-stone-900 bg-stone-50'
                        : 'border border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {p.popular && (
                      <div style={{ fontFamily: 'var(--font-syne)' }} className="text-[10px] font-bold tracking-widest uppercase text-stone-600 mb-1">
                        Most popular
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900">{p.name}</div>
                    <div style={{ fontFamily: 'var(--font-syne)' }} className="text-2xl font-bold text-stone-900 my-1">{p.price}</div>
                    <div className="text-[11px] text-stone-600 mb-2">one time</div>
                    <ul className="text-[11px] text-stone-600 space-y-1 text-left">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex gap-1">
                          <span className="text-green-600 flex-shrink-0">&#10003;</span>{f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <button
                onClick={() => handlePlanSelect(selectedPlan)}
                style={{ fontFamily: 'var(--font-syne)' }}
                className="w-full py-3 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 transition-colors tracking-wide mb-3"
              >
                Continue with {selectedPlan === 'full-audit' ? 'Full Audit' : 'Quick Score'} →
              </button>
              <button
                onClick={() => setStep('input')}
                className="w-full text-xs text-stone-600 hover:text-stone-600 underline"
              >
                ← Change URL
              </button>
            </div>
          )}

          {/* Step 2.5: Photo upload (Full Audit only) */}
          {step === 'photos' && (
            <PhotoUploadStep
              onContinue={handlePhotosContinue}
              uploading={photoUploading}
            />
          )}

          {/* Step 3: Loading */}
          {step === 'loading' && (
            <div className="py-6 text-center">
              <div className="w-10 h-10 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-5" />
              <ul className="inline-block text-left space-y-1.5">
                {loadingSteps.map((s, i) => (
                  <li key={i} className="text-sm transition-colors duration-300" style={{
                    color: i < stepIndex ? '#a8a29e' : i === stepIndex ? '#1c1917' : '#d6d3d1',
                    fontWeight: i === stepIndex ? 500 : 400,
                  }}>
                    {i < stepIndex ? '✓ ' : i === stepIndex ? '› ' : '  '}{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-stone-600">
          <span>✦ Title optimization</span>
          <span>✦ Photo strategy</span>
          <span>✦ SEO keywords</span>
          <span>✦ Conversion tips</span>
        </div>

        <p className="text-center text-xs text-stone-600 mt-6">
          Questions? <a href="https://m.me/redhiker" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">Message us on Facebook</a>
        </p>

        <div className="text-[11px] text-stone-600 text-center mt-6 leading-relaxed max-w-md mx-auto space-y-2 font-bold">
          <p>
            This report analyses your listing&apos;s text, title, photos, and presentation. Pricing strategy, calendar management, minimum-stay rules, and demand-based adjustments are outside this tool&apos;s scope but significantly impact performance.
          </p>
          <p>
            Results are AI-generated, may not be fully accurate, and can vary between runs for the same listing. This is not financial advice. Use results as guidance alongside your own judgement. ListingIQ is not affiliated with Airbnb.
          </p>
          <p className="text-stone-500 mt-2">v{APP_VERSION}</p>
        </div>
      </div>
    </main>
  )
}
