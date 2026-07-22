'use client'
import { useState, useEffect, useCallback } from 'react'
import Logo from '../components/Logo'
import Report from '../components/Report'
import { ReportData } from '../lib/types'
import { PhotoAnalysisResult } from '../api/analyze-photos/route'
import PmsEmailCapture from '../components/PmsEmailCapture'

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

type Step = 'connect' | 'properties' | 'plan-select' | 'analyzing' | 'report'

export default function HostexPage() {
  const [step, setStep] = useState<Step>('connect')
  const [connected, setConnected] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'quick-score' | 'full-audit'>('quick-score')
  const [report, setReport] = useState<ReportData | null>(null)
  const [photoResults, setPhotoResults] = useState<PhotoAnalysisResult | null>(null)
  const [analyzingTitle, setAnalyzingTitle] = useState('')
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [updatedPropertyIds, setUpdatedPropertyIds] = useState<Set<string>>(new Set())

  // On mount: check URL params for session_id (return from Stripe)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Return from Stripe payment
    const sessionId = params.get('session_id')
    const propertyId = params.get('propertyId')
    const plan = params.get('plan')
    if (sessionId && propertyId) {
      setConnected(true)
      const effectivePlan = (plan === 'full-audit' ? 'full-audit' : 'quick-score') as 'quick-score' | 'full-audit'
      setSelectedPlan(effectivePlan)
      window.history.replaceState({}, '', '/hostex')
      runAnalysis(propertyId, sessionId, effectivePlan)
      return
    }

    // Try loading properties — if cookie exists, server will accept
    setConnected(true) // Optimistic; fetchProperties will reset if 401
  }, [])

  // Fetch properties (server reads connectionId from httpOnly cookie)
  const fetchProperties = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/hostex/properties')
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          setConnected(false)
          setStep('connect')
          // Don't show error on initial load with no cookie
          if (data.error && !data.error.includes('Not connected')) {
            setError(data.error)
          }
          return
        }
        throw new Error(data.error || 'Failed to load listings')
      }
      setProperties(data.properties || [])
      // Don't overwrite 'analyzing' or 'report' step (e.g. when returning from Stripe payment)
      setStep(prev => prev === 'analyzing' || prev === 'report' ? prev : 'properties')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch saved reports
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/reports?platform=hostex')
      const data = await res.json()
      if (res.ok && data.reports) {
        setSavedReports(data.reports)
      }
    } catch { /* non-critical */ }
  }, [])

  // Fetch webhook notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/notifications?platform=hostex')
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

  async function handleConnect() {
    const token = tokenInput.trim()
    if (!token) {
      setError('Please enter your Hostex API token.')
      return
    }

    setConnecting(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/hostex/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')

      // Cookie is set by the server — just update UI state
      setConnected(true)
      setTokenInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  async function runAnalysis(listingId: string, sessionId: string, plan: string) {
    const prop = properties.find(p => p.id === listingId)
    setSelectedId(listingId)
    setAnalyzingTitle(prop?.title || 'Listing')
    setStep('analyzing')
    setError('')
    setPhotoResults(null)

    try {
      const res = await fetch('/api/integrations/hostex/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          plan,
          sessionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      const result = data.results?.[0]
      if (!result || result.skipped) {
        throw new Error(result?.reason || 'Listing could not be analyzed')
      }

      setReport(result.report as ReportData)
      // Run photo analysis if listing has photo URLs and plan is full-audit
      if (result.photoUrls?.length && plan === 'full-audit') {
        try {
          const photoRes = await fetch('/api/analyze-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoUrls: result.photoUrls.slice(0, 10),
              listingContext: {
                title: result.listing?.title || '',
                amenities: result.listing?.amenities || [],
                missingPhotos: result.report?.missingPhotos || [],
              },
            }),
          })
          if (photoRes.ok) {
            const photoData = await photoRes.json()
            setPhotoResults(photoData)
          }
        } catch (photoErr) {
          console.warn('[hostex] Photo analysis failed:', photoErr)
        }
      }

      setStep('report')
      fetchReports()

      // Auto-send report email if user saved their email
      if (result.reportId) {
        const savedEmail = localStorage.getItem('pms_email_hostex')
        if (savedEmail) {
          fetch('/api/integrations/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: result.reportId, email: savedEmail }),
          }).catch(() => {})
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setStep('properties')
    }
  }

  function handleAnalyzeClick(listingId: string) {
    setSelectedId(listingId)
    setStep('plan-select')
  }

  async function handlePlanSelected(plan: 'quick-score' | 'full-audit') {
    setSelectedPlan(plan)

    if (!selectedId) return

    // Create Stripe checkout session
    try {
      const res = await fetch('/api/integrations/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          platform: 'hostex',
          propertyId: selectedId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')

      // Redirect to Stripe
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setStep('properties')
    }
  }

  function viewSavedReport(sr: SavedReport) {
    setReport(sr.report_data as ReportData)
    setPhotoResults(null)
    setStep('report')
  }

  async function disconnect() {
    await fetch('/api/integrations/hostex/disconnect', { method: 'POST' })
    localStorage.removeItem('pms_email_hostex')
    setConnected(false)
    setProperties([])
    setReport(null)
    setPhotoResults(null)
    setSavedReports([])
    setStep('connect')
    setError('')
    setTokenInput('')
  }

  function backToProperties() {
    setReport(null)
    setPhotoResults(null)
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
            Back to listings
          </button>
        </div>
        <Report
          data={report}
          onReset={backToProperties}
          plan={selectedPlan}
          isDemo={false}
          listingUrl=""
          initialPhotoResults={photoResults}
          initialPhotoPreviews={null}
          onUpgrade={() => {}}
          photoError={false}
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
            Hostex Integration
          </h1>
          <p className="text-stone-600 text-base leading-relaxed">
            Connect your Hostex account to analyze<br />
            your listings without pasting URLs.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Connect step — token input */}
          {step === 'connect' && !loading && (
            <div className="py-2">
              <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <p className="text-sm text-stone-600 mb-4 text-center">
                Enter your Hostex API token to import your listings and get instant optimization reports.
              </p>
              <div className="mb-3">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={e => { setTokenInput(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  placeholder="Paste your Hostex API token"
                  className="w-full h-11 px-4 rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-900 outline-none focus:border-stone-400 placeholder-stone-300"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{ fontFamily: 'var(--font-syne)' }}
                className="w-full py-3 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 transition-colors tracking-wide disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Connect Hostex'}
              </button>
              <p className="text-xs text-stone-400 mt-3 text-center">
                Find your API token in Hostex under Settings &rarr; API.
              </p>
            </div>
          )}

          {/* Loading listings */}
          {loading && (
            <div className="py-8 text-center">
              <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-stone-500">Loading your listings...</p>
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
                Back to listings
              </button>
            </div>
          )}

          {/* Listings list */}
          {step === 'properties' && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900">
                  Your Listings ({properties.length})
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

              {/* Email capture for report recovery */}
              <PmsEmailCapture platform="hostex" />

              {properties.length === 0 && (
                <p className="text-sm text-stone-500 text-center py-4">
                  No Airbnb listings found in your Hostex account.
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
              <p className="text-xs text-stone-500">
                This typically takes 30-60 seconds...
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
