'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Logo from '../components/Logo'
import Report from '../components/Report'
import { ReportData } from '../lib/types'
import PhotoUploadStep from '../components/PhotoUploadStep'
import { usePhotoAnalysis } from '../lib/use-photo-analysis'

const LOADING_STEPS = [
  'Reading listing details...',
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

interface WebhookNotification {
  propertyId: string
  event: string
  updatedAt: string
}

interface Property {
  id: string
  title: string
  location?: string
  photoUrl?: string | null
  photoCount: number
  amenityCount: number
  readiness: 'full' | 'partial' | 'insufficient'
  missing: string[]
}

interface SavedReport {
  id: string
  property_id: string
  plan: string
  report_data: ReportData
  overall_score: number
  created_at: string
  listing_data: { title?: string }
}

type Step = 'connect' | 'properties' | 'plan-select' | 'photos' | 'analyzing' | 'report'

export default function HospitablePage() {
  const [step, setStep] = useState<Step>('connect')
  const [connected, setConnected] = useState(false)
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'quick-score' | 'full-audit'>('quick-score')
  const [report, setReport] = useState<ReportData | null>(null)
  const { photoResults, photoPreviews, photoError, analyzePhotos, resetPhotoState } = usePhotoAnalysis()
  const [analyzingTitle, setAnalyzingTitle] = useState('')
  const [stepIndex, setStepIndex] = useState(-1)
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [updatedPropertyIds, setUpdatedPropertyIds] = useState<Set<string>>(new Set())
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoUploadId, setPhotoUploadId] = useState<string | null>(null)
  const [isUpgrade, setIsUpgrade] = useState(false)

  // On mount: check URL params for connection status, session_id, or error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // OAuth error
    const errParam = params.get('error')
    if (errParam) {
      setError(errParam)
      window.history.replaceState({}, '', '/hospitable')
      return
    }

    // Fresh OAuth connection (cookie is already set by callback)
    const connectedParam = params.get('connected')
    if (connectedParam === 'true') {
      setConnected(true)
      window.history.replaceState({}, '', '/hospitable')
      return
    }

    // Return from Stripe payment
    const sessionId = params.get('session_id')
    const propertyId = params.get('propertyId')
    const plan = params.get('plan')
    const uploadIdParam = params.get('uploadId')
    if (sessionId && propertyId) {
      setConnected(true)
      const effectivePlan = (plan === 'full-audit' ? 'full-audit' : 'quick-score') as 'quick-score' | 'full-audit'
      setSelectedPlan(effectivePlan)
      if (uploadIdParam) setPhotoUploadId(uploadIdParam)
      window.history.replaceState({}, '', '/hospitable')

      // Check if report already exists (handles browser back button / page refresh)
      fetch(`/api/integrations/reports?sessionId=${encodeURIComponent(sessionId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.report) {
            setReport(data.report.report_data as ReportData)
            setSelectedPlan((data.report.plan || effectivePlan) as 'quick-score' | 'full-audit')
            setStep('report')
          } else {
            runAnalysis(propertyId, sessionId, effectivePlan)
          }
        })
        .catch(() => {
          runAnalysis(propertyId, sessionId, effectivePlan)
        })
      return
    }

    // Email re-access: session_id without propertyId — load saved report
    if (sessionId && !propertyId) {
      fetch(`/api/integrations/reports?sessionId=${encodeURIComponent(sessionId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.report) {
            setReport(data.report.report_data as ReportData)
            setSelectedPlan((data.report.plan || 'quick-score') as 'quick-score' | 'full-audit')
            setStep('report')
          }
        })
        .catch(() => {})
      window.history.replaceState({}, '', '/hospitable')
      return
    }

    // Try loading properties — if cookie exists, server will accept the request
    setConnected(true) // Optimistic; fetchProperties will reset if 401
  }, [])

  // Fetch properties (server reads connectionId from httpOnly cookie)
  const fetchProperties = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/hospitable/properties')
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          setConnected(false)
          setStep('connect')
          setError(data.error || 'Your Hospitable session expired. Please reconnect.')
          return
        }
        throw new Error(data.error || 'Failed to load properties')
      }
      setProperties(data.properties || [])
      setStep('properties')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load properties')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch saved reports
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/reports?platform=hospitable')
      const data = await res.json()
      if (res.ok && data.reports) {
        setSavedReports(data.reports)
      }
    } catch { /* non-critical */ }
  }, [])

  // Fetch webhook notifications (properties that changed since last analysis)
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/notifications?platform=hospitable')
      const data = await res.json()
      if (res.ok && data.updatedProperties) {
        setUpdatedPropertyIds(new Set(data.updatedProperties.map((u: WebhookNotification) => u.propertyId)))
      }
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    if (connected) {
      fetchProperties()
      fetchReports()
      fetchNotifications()
    }
  }, [connected, fetchProperties, fetchReports, fetchNotifications])

  async function runAnalysis(propertyId: string, sessionId: string, plan: string) {
    const prop = properties.find(p => p.id === propertyId)
    setSelectedId(propertyId)
    setAnalyzingTitle(prop?.title || 'Property')
    setStep('analyzing')
    setError('')
    resetPhotoState()

    // Start animated loading steps
    const steps = plan === 'full-audit' ? LOADING_STEPS_WITH_PHOTOS : LOADING_STEPS
    setStepIndex(0)
    let idx = 0
    if (stepTimerRef.current) clearInterval(stepTimerRef.current)
    stepTimerRef.current = setInterval(() => {
      idx++
      if (idx < steps.length) {
        setStepIndex(idx)
      } else {
        if (stepTimerRef.current) clearInterval(stepTimerRef.current)
      }
    }, 6000)

    try {
      const res = await fetch('/api/integrations/hospitable/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          plan,
          sessionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      const result = data.results?.[0]
      if (!result || result.skipped) {
        throw new Error(result?.reason || 'Property could not be analyzed')
      }

      if (result.report?._analysisTime) {
        console.log(`[ListingIQ] Analysis completed in ${result.report._analysisTime}s (score: ${result.report.overallScore})`)
      }
      setReport(result.report as ReportData)
      // Photo analysis for Full Audit
      if (plan === 'full-audit') {
        const savedUploadId = photoUploadId || localStorage.getItem('listingiq_pms_upload_id')
        await analyzePhotos({
          sessionId,
          uploadId: savedUploadId,
          photoUrls: result.photoUrls?.slice(0, 10),
          listingContext: {
            title: result.listing?.title || '',
            amenities: result.listing?.amenities || [],
            missingPhotos: result.report?.missingPhotos || [],
          },
        })
        if (savedUploadId) localStorage.removeItem('listingiq_pms_upload_id')
      }

      if (stepTimerRef.current) clearInterval(stepTimerRef.current)
      setSelectedPlan(plan as 'quick-score' | 'full-audit')
      setStep('report')
      fetchReports()

      // Auto-send report email if user saved their email
      if (result.reportId) {
        const savedEmail = localStorage.getItem('pms_email_hospitable')
        if (savedEmail) {
          fetch('/api/integrations/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: result.reportId, email: savedEmail }),
          }).catch(() => {})
        }
      }
    } catch (err) {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current)
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setStep('properties')
    }
  }

  function handleAnalyzeClick(propertyId: string) {
    setSelectedId(propertyId)
    setStep('plan-select')
  }

  async function handlePlanSelected(plan: 'quick-score' | 'full-audit') {
    setSelectedPlan(plan)

    if (!selectedId) return

    // Full Audit: show photo upload step first
    if (plan === 'full-audit') {
      setStep('photos')
      return
    }

    // Quick Score: go straight to payment
    goToCheckout(plan)
  }

  async function handlePhotosContinue(files: File[], _previews: string[]) {
    setPhotoUploading(true)
    try {
      const form = new FormData()
      files.forEach(f => form.append('photos', f))
      const res = await fetch('/api/upload-photos', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setPhotoUploadId(data.uploadId)
      goToCheckout(isUpgrade ? 'full-audit-upgrade' : selectedPlan, data.uploadId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Photo upload failed')
      setStep('plan-select')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function goToCheckout(plan: string, uploadId?: string) {
    if (!selectedId) return

    // Save uploadId so it's available after Stripe redirect or mock analysis
    if (uploadId) localStorage.setItem('listingiq_pms_upload_id', uploadId)

    if (process.env.NEXT_PUBLIC_USE_MOCK_API === 'true') {
      runAnalysis(selectedId, '', plan)
      return
    }

    try {
      const res = await fetch('/api/integrations/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          platform: 'hospitable',
          propertyId: selectedId,
          ...(uploadId ? { uploadId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')

      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setStep('properties')
    }
  }

  function viewSavedReport(sr: SavedReport) {
    setReport(sr.report_data as ReportData)
    resetPhotoState()
    setStep('report')
  }

  async function disconnect() {
    await fetch('/api/integrations/hospitable/disconnect', { method: 'POST' })
    localStorage.removeItem('pms_email_hospitable')
    setConnected(false)
    setProperties([])
    setReport(null)
    setSavedReports([])
    setStep('connect')
    setError('')
  }

  function backToProperties() {
    setReport(null)
    resetPhotoState()
    setSelectedId(null)
    setStep('properties')
  }

  const readinessLabel = (r: Property['readiness']) => {
    if (r === 'full') return { text: 'Ready', color: 'text-green-600 bg-green-50 border-green-200' }
    if (r === 'partial') return { text: 'Partial data', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    return { text: 'Not enough data', color: 'text-red-600 bg-red-50 border-red-200' }
  }

  // Report view
  if (step === 'report' && report) {
    return (
      <main className="min-h-screen py-12" style={{ background: '#F7F6F3' }}>
        <div className="max-w-2xl mx-auto px-4 mb-6 text-center">
          <div className="flex justify-center mb-2">
            <Logo size={40} />
          </div>
          <button
            onClick={backToProperties}
            className="text-sm text-stone-500 hover:text-stone-700 underline"
          >
            Back to properties
          </button>
        </div>
        <Report
          data={report}
          onReset={backToProperties}
          plan={selectedPlan}
          isDemo={false}
          listingUrl=""
          initialPhotoResults={photoResults}
          initialPhotoPreviews={photoPreviews}
          onUpgrade={() => {
            setSelectedPlan('full-audit')
            setIsUpgrade(true)
            setStep('photos')
          }}
          photoError={photoError}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: '#F7F6F3' }}>
      <div className="w-full max-w-xl">

        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <Logo size={40} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-syne)' }} className="text-3xl font-bold text-stone-900 leading-snug mb-3">
            Hospitable Integration
          </h1>
          <p className="text-stone-600 text-base leading-relaxed">
            Connect your Hospitable account to analyze<br />
            your properties without pasting URLs.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Connect step */}
          {step === 'connect' && !loading && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
              <p className="text-sm text-stone-600 mb-5">
                Link your Hospitable account to import your properties and get instant optimization reports.
              </p>
              <a
                href="/api/hospitable/authorize"
                style={{ fontFamily: 'var(--font-syne)' }}
                className="inline-block px-6 py-3 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 transition-colors tracking-wide"
              >
                Connect Hospitable
              </a>
            </div>
          )}

          {/* Loading properties */}
          {loading && (
            <div className="py-8 text-center">
              <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-stone-500">Loading your properties...</p>
            </div>
          )}

          {/* Plan selection */}
          {step === 'plan-select' && (
            <div className="py-4">
              <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900 mb-4 text-center">
                Choose your analysis plan
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handlePlanSelected('quick-score')}
                  className="w-full border border-stone-200 rounded-xl p-4 hover:border-stone-400 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-900">Quick Score</p>
                      <p className="text-xs text-stone-500 mt-0.5">Title, description, amenities, SEO, action plan</p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-syne)' }} className="text-lg font-bold text-stone-900">$29</span>
                  </div>
                </button>
                <button
                  onClick={() => handlePlanSelected('full-audit')}
                  className="w-full border-2 border-stone-900 rounded-xl p-4 hover:bg-stone-50 transition-colors text-left relative"
                >
                  <span className="absolute -top-2.5 right-3 bg-stone-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    POPULAR
                  </span>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-900">Full Audit</p>
                      <p className="text-xs text-stone-500 mt-0.5">Everything above + AI photo analysis with gallery reorder</p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-syne)' }} className="text-lg font-bold text-stone-900">$49</span>
                  </div>
                </button>
              </div>
              <button
                onClick={() => setStep('properties')}
                className="w-full mt-4 text-xs text-stone-400 hover:text-stone-600 underline text-center"
              >
                Back to properties
              </button>
            </div>
          )}

          {/* Photo upload (Full Audit only) */}
          {step === 'photos' && (
            <PhotoUploadStep
              onContinue={handlePhotosContinue}
              onSkip={() => goToCheckout(isUpgrade ? 'full-audit-upgrade' : selectedPlan)}
              uploading={photoUploading}
            />
          )}

          {/* Properties list */}
          {step === 'properties' && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900">
                  Your Properties ({properties.length})
                </p>
                <div className="flex items-center gap-3">
                  {savedReports.length > 0 && (
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="text-xs text-stone-500 hover:text-stone-700 underline"
                    >
                      {showHistory ? 'Hide history' : `History (${savedReports.length})`}
                    </button>
                  )}
                  {showHistory && savedReports.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm('Clear all report history?')) return
                        await fetch('/api/integrations/reports?platform=hospitable', { method: 'DELETE' })
                        setSavedReports([])
                        setShowHistory(false)
                      }}
                      className="text-xs text-red-400 hover:text-red-600 underline"
                    >
                      Clear history
                    </button>
                  )}
                  <button
                    onClick={disconnect}
                    className="text-xs text-stone-400 hover:text-red-500 underline"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Report history */}
              {showHistory && savedReports.length > 0 && (
                <div className="mb-4 border border-stone-100 rounded-xl p-3 bg-stone-50">
                  <p className="text-xs font-medium text-stone-600 mb-2">Previous Reports</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {savedReports.map(r => (
                      <button
                        key={r.id}
                        onClick={() => viewSavedReport(r)}
                        className="w-full text-left px-3 py-2 bg-white rounded-lg border border-stone-200 hover:border-stone-300 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-stone-700 truncate">
                            {r.listing_data?.title || 'Untitled'}
                          </span>
                          <span className="text-[10px] text-stone-400 ml-2 flex-shrink-0">
                            Score: {r.overall_score} &middot; {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}


              {properties.length === 0 && (
                <p className="text-sm text-stone-500 text-center py-4">
                  No properties found in your Hospitable account.
                </p>
              )}

              <div className="space-y-3">
                {properties.map(prop => {
                  const badge = readinessLabel(prop.readiness)
                  const canAnalyze = prop.readiness !== 'insufficient'
                  return (
                    <div
                      key={prop.id}
                      className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition-colors"
                    >
                      <div className="flex gap-3">
                        {prop.photoUrl ? (
                          <img
                            src={prop.photoUrl}
                            alt=""
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">{prop.title}</p>
                          {prop.location && (
                            <p className="text-xs text-stone-500 truncate">{prop.location}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.color}`}>
                              {badge.text}
                            </span>
                            {updatedPropertyIds.has(prop.id) && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-blue-600 bg-blue-50 border-blue-200">
                                Updated
                              </span>
                            )}
                            <span className="text-[10px] text-stone-400">
                              {prop.photoCount} photos &middot; {prop.amenityCount} amenities
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAnalyzeClick(prop.id)}
                          disabled={!canAnalyze}
                          style={{ fontFamily: 'var(--font-syne)' }}
                          className={`self-center px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                            canAnalyze
                              ? 'bg-stone-900 text-white hover:bg-stone-700'
                              : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                          }`}
                        >
                          Analyze
                        </button>
                      </div>
                      {prop.readiness === 'insufficient' && prop.missing.length > 0 && (
                        <p className="text-[10px] text-red-500 mt-2">
                          Missing: {prop.missing.join(', ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Analyzing */}
          {step === 'analyzing' && (
            <div className="py-8 text-center">
              <div className="w-10 h-10 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-5" />
              <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900 mb-1">
                Analyzing {analyzingTitle}
              </p>
              <ul className="text-xs text-stone-500 space-y-1 mt-3 mb-3">
                {(selectedPlan === 'full-audit' ? LOADING_STEPS_WITH_PHOTOS : LOADING_STEPS).map((s, i) => (
                  <li key={i} className={i <= stepIndex ? 'text-stone-700' : 'text-stone-300'}>
                    {i < stepIndex ? '✓' : i === stepIndex ? '›' : '·'} {s}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-stone-400">
                {selectedPlan === 'full-audit' ? 'Full Audit can take up to 3 minutes' : 'This typically takes about a minute...'}
              </p>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          <a href="/" className="underline hover:text-stone-700">Back to ListingIQ</a>
          {' '}&middot;{' '}
          Questions? <a href="https://m.me/redhiker" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-700">Message us</a>
        </p>

      </div>
    </main>
  )
}
