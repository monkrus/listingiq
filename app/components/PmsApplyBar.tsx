'use client'
import { useState } from 'react'
import { ReportData } from '@/app/lib/types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

interface Props {
  platform: 'hospitable' | 'hostex'
  connectionId: string
  propertyId: string
  reportData: ReportData
  photoResults?: PhotoAnalysisResult | null
}

export default function PmsApplyBar({ platform, connectionId, propertyId, reportData, photoResults }: Props) {
  const [applyingTitle, setApplyingTitle] = useState(false)
  const [applyingDesc, setApplyingDesc] = useState(false)
  const [applyingPhotos, setApplyingPhotos] = useState(false)
  const [titleApplied, setTitleApplied] = useState(false)
  const [descApplied, setDescApplied] = useState(false)
  const [photosApplied, setPhotosApplied] = useState(false)
  const [error, setError] = useState('')

  const endpoint = `/api/integrations/${platform}/apply`
  const idField = platform === 'hospitable' ? 'propertyId' : 'listingId'

  const bestTitle = reportData.titleSuggestions?.[0]
  const bestDescription = reportData.descriptionRewrite

  // Get recommended photo order from photo analysis results
  // suggestedOrder is number[] (indices into original photo array)
  const suggestedOrder = photoResults?.suggestedOrder
  const hasPhotoReorder = Array.isArray(suggestedOrder) && suggestedOrder.length > 0
  // Build reordered URL array from the photo URLs on the report
  const reorderedPhotoUrls = hasPhotoReorder && reportData.photoUrls
    ? suggestedOrder.map(i => reportData.photoUrls![i]).filter(Boolean)
    : []

  async function applyField(field: 'title' | 'description') {
    const value = field === 'title' ? bestTitle : bestDescription
    if (!value) return

    const setApplying = field === 'title' ? setApplyingTitle : setApplyingDesc
    const setApplied = field === 'title' ? setTitleApplied : setDescApplied
    setApplying(true)
    setError('')

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          [idField]: propertyId,
          [field]: value,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to apply ${field}`)
      setApplied(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to apply ${field}`)
    } finally {
      setApplying(false)
    }
  }

  async function applyPhotoOrder() {
    if (!reorderedPhotoUrls.length) return
    setApplyingPhotos(true)
    setError('')

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          [idField]: propertyId,
          photoOrder: reorderedPhotoUrls,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply photo order')
      setPhotosApplied(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply photo order')
    } finally {
      setApplyingPhotos(false)
    }
  }

  if (!bestTitle && !bestDescription && !reorderedPhotoUrls.length) return null

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
      <h3 style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900 uppercase tracking-wide mb-3">
        Apply to your listing
      </h3>
      <p className="text-xs text-stone-500 mb-4">
        Push optimized content directly to your {platform === 'hospitable' ? 'Hospitable' : 'Hostex'} listing. Review changes before applying.
      </p>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {bestTitle && (
          <div className="border border-stone-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-600">Optimized Title</span>
              {titleApplied ? (
                <span className="text-xs text-green-600 font-medium">Applied</span>
              ) : (
                <button
                  onClick={() => applyField('title')}
                  disabled={applyingTitle}
                  style={{ fontFamily: 'var(--font-syne)' }}
                  className="px-3 py-1.5 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {applyingTitle ? 'Applying...' : 'Apply Title'}
                </button>
              )}
            </div>
            <p className="text-sm text-stone-800 bg-stone-50 rounded-lg px-3 py-2">{bestTitle}</p>
          </div>
        )}

        {bestDescription && (
          <div className="border border-stone-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-600">Optimized Description</span>
              {descApplied ? (
                <span className="text-xs text-green-600 font-medium">Applied</span>
              ) : (
                <button
                  onClick={() => applyField('description')}
                  disabled={applyingDesc}
                  style={{ fontFamily: 'var(--font-syne)' }}
                  className="px-3 py-1.5 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {applyingDesc ? 'Applying...' : 'Apply Description'}
                </button>
              )}
            </div>
            <p className="text-sm text-stone-800 bg-stone-50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-line text-xs leading-relaxed">
              {bestDescription.slice(0, 300)}{bestDescription.length > 300 ? '...' : ''}
            </p>
          </div>
        )}

        {reorderedPhotoUrls.length > 0 && (
          <div className="border border-stone-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-600">Optimized Photo Order</span>
              {photosApplied ? (
                <span className="text-xs text-green-600 font-medium">Applied</span>
              ) : (
                <button
                  onClick={applyPhotoOrder}
                  disabled={applyingPhotos}
                  style={{ fontFamily: 'var(--font-syne)' }}
                  className="px-3 py-1.5 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {applyingPhotos ? 'Applying...' : 'Apply Photo Order'}
                </button>
              )}
            </div>
            <p className="text-xs text-stone-500">
              Reorder {reorderedPhotoUrls.length} photos based on AI scoring — best hero shot first.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
