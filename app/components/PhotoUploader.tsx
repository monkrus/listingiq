'use client'
import { useState, useRef, useCallback } from 'react'
import { PhotoAnalysisResult, PhotoVerdict } from '@/app/api/analyze-photos/route'
import { DEMO_PHOTO_RESULT, DEMO_PHOTO_PREVIEWS } from '@/app/lib/demo'

const VERDICT_COLORS = {
  keep: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-800' },
  retake: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-800' },
}

const VERDICT_LABELS = { keep: '✓ Keep', retake: '↺ Retake' }

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? '#4a7c2f' : score >= 50 ? '#b45309' : '#b91c1c'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{score}</span>
    </div>
  )
}

function PhotoCard({ photo, preview }: { photo: PhotoVerdict; preview: string }) {
  const [expanded, setExpanded] = useState(false)
  const c = VERDICT_COLORS[photo.verdict]

  return (
    <div className={`border rounded-2xl overflow-hidden ${c.border} ${c.bg}`}>
      <div className="relative">
        <img src={preview} alt={photo.filename} className="w-full h-40 object-cover" />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c.badge}`}>
            {VERDICT_LABELS[photo.verdict]}
          </span>
          {photo.heroWorthy && (
            <span className="text-xs font-bold px-2 py-1 rounded-lg bg-purple-100 text-purple-800">
              Hero shot
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="mb-1">
          <span className="text-xs text-stone-600 block truncate">Photo {photo.index + 1}</span>
        </div>
        <ScoreBar score={photo.score} />

        {photo.strengths.length > 0 && (
          <div className="mt-2">
            {photo.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-stone-600 mt-1">
                <span className="text-green-500 mt-0.5 flex-shrink-0">+</span>{s}
              </div>
            ))}
          </div>
        )}

        {photo.problems.length > 0 && (
          <div className="mt-1">
            {photo.problems.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-stone-600 mt-1">
                <span className="text-red-400 mt-0.5 flex-shrink-0">−</span>{p}
              </div>
            ))}
          </div>
        )}

        {photo.verdict === 'retake' && photo.retakeInstructions && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-red-600 underline w-full text-left"
          >
            {expanded ? 'Hide' : 'Show'} retake instructions
          </button>
        )}

        {expanded && photo.retakeInstructions && (
          <div className="mt-2 bg-white border border-red-100 rounded-xl p-2.5 text-xs text-stone-700 leading-relaxed italic">
            {photo.retakeInstructions}
          </div>
        )}

      </div>
    </div>
  )
}


interface ListingContext {
  title?: string
  description?: string
  amenities?: string[]
  missingPhotos?: string[]
}

type Step = 'upload' | 'results'

export default function PhotoUploader({ listingContext, onResults, onPreviews }: { listingContext?: ListingContext; onResults?: (r: PhotoAnalysisResult | null) => void; onPreviews?: (p: string[]) => void } = {}) {
  const [previews, setPreviews] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('upload')
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_PHOTOS = 10

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const rejected = arr.filter(f => !ALLOWED_TYPES.includes(f.type))
    const valid = arr.filter(f => ALLOWED_TYPES.includes(f.type))

    const messages: string[] = []

    if (rejected.length > 0) {
      messages.push(`${rejected.length} file${rejected.length > 1 ? 's' : ''} skipped — only JPG, PNG, and WebP are accepted.`)
    }

    if (!valid.length) {
      if (messages.length) setError(messages.join(' '))
      return
    }

    // Detect duplicates by name + size
    const existingKeys = new Set(files.map(f => `${f.name}_${f.size}`))
    const dupes = valid.filter(f => existingKeys.has(`${f.name}_${f.size}`))
    const unique = valid.filter(f => !existingKeys.has(`${f.name}_${f.size}`))

    if (dupes.length > 0) {
      messages.push(`${dupes.length} duplicate${dupes.length > 1 ? 's' : ''} removed (${dupes.map(f => f.name).join(', ')}).`)
    }

    if (!unique.length) {
      if (messages.length) setError(messages.join(' '))
      return
    }

    const spotsLeft = MAX_PHOTOS - files.length
    if (spotsLeft <= 0) {
      setError(`Maximum ${MAX_PHOTOS} photos reached. Remove some to add more.`)
      return
    }

    const toAdd = unique.slice(0, spotsLeft)
    if (unique.length > spotsLeft) {
      messages.push(`Only ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left — ${unique.length - spotsLeft} photo${unique.length - spotsLeft > 1 ? 's' : ''} skipped.`)
    }

    setError(messages.length ? messages.join(' ') : '')
    setFiles(prev => [...prev, ...toAdd])

    toAdd.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(f)
    })
  }, [files])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  function removePhoto(i: number) {
    setFiles(f => f.filter((_, idx) => idx !== i))
    setPreviews(p => p.filter((_, idx) => idx !== i))
    setResult(null)
    setStep('upload')
    onResults?.(null)
  }

  function loadDemo() {
    setPreviews(DEMO_PHOTO_PREVIEWS)
    setResult(DEMO_PHOTO_RESULT)
    setStep('results')
    onResults?.(DEMO_PHOTO_RESULT)
    onPreviews?.(DEMO_PHOTO_PREVIEWS)
  }

  async function analyze() {
    if (!files.length) return

    const sessionId = localStorage.getItem('listingiq_session_id')
    const isMock = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'
    if (!sessionId && !isMock) {
      setError('Photo analysis requires a Full Audit plan. Purchase one from the home page to unlock this feature.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    const form = new FormData()
    files.forEach(f => form.append('photos', f))
    if (listingContext) {
      form.append('listingContext', JSON.stringify(listingContext))
    }
    if (sessionId) {
      form.append('sessionId', sessionId)
    }

    try {
      const res = await fetch('/api/analyze-photos', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setStep('results')
      onResults?.(data)
      onPreviews?.(previews)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  function scoreColor(s: number) {
    return s >= 75 ? '#4a7c2f' : s >= 50 ? '#b45309' : '#b91c1c'
  }

  function resetAll() {
    setResult(null)
    setPreviews([])
    setFiles([])
    setError('')
    setStep('upload')
    onPreviews?.([])
    onResults?.(null)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Step 1: Upload zone */}
      {step === 'upload' && (
        <>
          <label
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            htmlFor="photo-upload-input"
            className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
              dragging ? 'border-stone-400 bg-stone-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
            }`}
          >
            <div className="text-3xl mb-3">⬆</div>
            <p style={{ fontFamily: 'var(--font-syne)' }} className="font-bold text-stone-900 mb-1">
              Drop your listing photos here
            </p>
            <p className="text-sm text-stone-600">or click to browse · up to 10 photos · JPG, PNG, WebP</p>
            <button
              type="button"
              onClick={e => { e.preventDefault(); e.stopPropagation(); loadDemo() }}
              className="mt-4 text-xs text-stone-600 hover:text-stone-600 underline"
            >
              Try demo →
            </button>
            <input
              ref={inputRef}
              id="photo-upload-input"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={e => { e.target.files && addFiles(e.target.files); e.target.value = '' }}
            />
          </label>

          {error && !previews.length && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

          {/* Preview grid */}
          {previews.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-stone-600">{files.length}/{MAX_PHOTOS} photos</span>
                <div className="flex gap-3">
                  {files.length < MAX_PHOTOS && (
                    <label
                      htmlFor="photo-upload-input"
                      className="text-xs text-blue-500 hover:text-blue-700 underline cursor-pointer"
                    >
                      Add more
                    </label>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setFiles([]); setPreviews([]); setError('') }}
                    className="text-xs text-stone-600 hover:text-stone-600 underline"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {previews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} className="w-full h-16 object-cover rounded-xl border border-stone-200" alt="" />
                    <button
                      onClick={e => { e.stopPropagation(); removePhoto(i) }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-stone-800 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center"
                    >×</button>
                    <span className="absolute bottom-1 left-1 bg-stone-900/60 text-white text-xs px-1 rounded">{i + 1}</span>
                  </div>
                ))}
              </div>

              {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

              <button
                onClick={analyze}
                disabled={loading}
                style={{ fontFamily: 'var(--font-syne)' }}
                className="w-full h-12 bg-stone-900 text-white font-bold rounded-xl hover:bg-stone-700 disabled:opacity-40 transition-colors tracking-wide text-sm"
              >
                {loading
                  ? `Optimizing ${files.length} photos...`
                  : `Optimize ${files.length} photo${files.length !== 1 ? 's' : ''} →`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2: Results */}
      {step === 'results' && result && (
        <div>
          {/* Summary bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 flex items-center gap-5">
            <div className="text-center flex-shrink-0">
              <div style={{ fontFamily: 'var(--font-syne)', color: scoreColor(result.overallPhotoScore) }}
                className="text-4xl font-bold">{result.overallPhotoScore}</div>
              <div className="text-xs text-stone-600 mt-0.5">photo score</div>
            </div>
            <div className="flex-1">
              <div className="flex gap-3 mb-2 text-sm">
                {(['keep', 'retake'] as const).map(v => {
                  const count = result.photos.filter(p => p.verdict === v).length
                  const c = VERDICT_COLORS[v]
                  return count > 0 ? (
                    <span key={v} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.badge}`}>
                      {count} {VERDICT_LABELS[v]}
                    </span>
                  ) : null
                })}
              </div>
              <p className="text-sm text-stone-600">{result.heroSuggestion}</p>
            </div>
          </div>

          {/* Missing shots */}
          {result.missingShots.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
              <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-amber-900 mb-2">
                Missing high-conversion shots
              </p>
              <div className="flex flex-wrap gap-2">
                {result.missingShots.map((s, i) => (
                  <span key={i} className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-lg">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Per-photo grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {result.photos.map((photo, i) => (
              <PhotoCard
                key={i}
                photo={photo}
                preview={previews[i]}
              />
            ))}
          </div>

          <button
            onClick={resetAll}
            className="w-full py-3 border border-stone-200 rounded-xl text-sm text-stone-600 hover:bg-stone-50 transition-colors"
          >
            ← Upload {files.length ? 'different' : 'your'} photos
          </button>
        </div>
      )}
    </div>
  )
}
