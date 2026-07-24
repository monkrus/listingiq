import { useState, useCallback } from 'react'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

export interface AnalyzePhotosInput {
  sessionId: string | null
  uploadId: string | null
  photoUrls?: string[]
  listingContext: {
    title: string
    amenities: string[]
    missingPhotos: string[]
  }
  reaccess?: boolean
  listingUrl?: string
  plan?: string
  /** When true, tries IndexedDB as fallback if uploadId expired (410). Main app only. */
  indexedDbFallback?: boolean
}

export interface AnalyzePhotosSuccess {
  results: PhotoAnalysisResult
  previews: string[] | null
}

/** Fetch with one automatic retry on 502 (transient Claude API failures). */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status === 502) {
    console.warn('[photo-analysis] Got 502, retrying in 3s...')
    await new Promise(r => setTimeout(r, 3000))
    return fetch(url, init)
  }
  return res
}

/**
 * Shared hook for photo analysis across main app and PMS integrations.
 * Handles the three-priority photo source chain:
 *   1. Server-side upload store (uploadId)
 *   2. IndexedDB fallback (main app only, when indexedDbFallback=true)
 *   3. Listing photo URLs from scraper/adapter
 */
export function usePhotoAnalysis() {
  const [photoResults, setPhotoResults] = useState<PhotoAnalysisResult | null>(null)
  const [photoPreviews, setPhotoPreviews] = useState<string[] | null>(null)
  const [photoError, setPhotoError] = useState(false)

  /**
   * Run photo analysis with automatic priority fallback.
   * Returns { results, previews } on success, null on failure.
   * Never throws — sets photoError internally on failure.
   */
  const analyzePhotos = useCallback(async (input: AnalyzePhotosInput): Promise<AnalyzePhotosSuccess | null> => {
    setPhotoError(false)

    try {
      const cacheInfo = { listingUrl: input.listingUrl || '', plan: input.plan || 'full-audit' }
      let photoRes: Response | null = null

      // Priority 1: server-side upload store
      if (input.uploadId) {
        photoRes = await fetchWithRetry('/api/analyze-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: input.uploadId,
            sessionId: input.sessionId,
            listingContext: input.listingContext,
            reaccess: input.reaccess,
            ...cacheInfo,
          }),
        })
      }

      // Priority 2: IndexedDB fallback (if upload expired and client has local copies)
      if (input.indexedDbFallback && (!photoRes || (!photoRes.ok && photoRes.status === 410))) {
        try {
          const { getPendingPhotos } = await import('@/app/lib/photo-db')
          const savedFiles = await getPendingPhotos()
          if (savedFiles?.length) {
            console.warn('[photo-analysis] Trying IndexedDB fallback...')
            const form = new FormData()
            savedFiles.forEach((f: File) => form.append('photos', f))
            form.append('sessionId', input.sessionId || '')
            form.append('listingContext', JSON.stringify(input.listingContext))
            form.append('listingUrl', cacheInfo.listingUrl)
            form.append('plan', cacheInfo.plan)
            photoRes = await fetchWithRetry('/api/analyze-photos', { method: 'POST', body: form })
          }
        } catch (e) {
          console.warn('[photo-analysis] IndexedDB fallback failed:', e)
        }
      }

      // Priority 3: listing photos from scraper/adapter
      if (!photoRes && input.photoUrls?.length) {
        photoRes = await fetchWithRetry('/api/analyze-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrls: input.photoUrls,
            sessionId: input.sessionId,
            listingContext: input.listingContext,
            reaccess: input.reaccess,
            ...cacheInfo,
          }),
        })
      }

      if (photoRes) {
        let photoData: Record<string, unknown>
        try {
          photoData = await photoRes.json()
        } catch {
          console.warn('[photo-analysis] Non-JSON response, status:', photoRes.status)
          setPhotoError(true)
          return null
        }
        if (photoRes.ok) {
          setPhotoResults(photoData as unknown as PhotoAnalysisResult)
          let previews: string[] | null = null
          if (photoData.previews) {
            previews = photoData.previews as string[]
            setPhotoPreviews(photoData.previews as string[])
          } else if (input.indexedDbFallback) {
            // Generate previews from IndexedDB files (FormData uploads don't return previews)
            try {
              const { getPendingPhotos } = await import('@/app/lib/photo-db')
              const savedFiles = await getPendingPhotos()
              if (savedFiles?.length) {
                previews = await Promise.all(savedFiles.map((f: File) =>
                  new Promise<string>(resolve => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result as string)
                    reader.readAsDataURL(f)
                  })
                ))
                setPhotoPreviews(previews)
              }
            } catch { /* IndexedDB unavailable */ }
          }
          // Clean up IndexedDB after successful analysis
          if (input.indexedDbFallback) {
            try {
              const { clearPendingPhotos } = await import('@/app/lib/photo-db')
              clearPendingPhotos()
            } catch { /* IndexedDB unavailable */ }
          }
          return { results: photoData as unknown as PhotoAnalysisResult, previews }
        } else {
          const errMsg = (photoData.error || photoData.message || `Server error ${photoRes.status}`) as string
          console.warn('[photo-analysis] Failed:', errMsg)
          setPhotoError(true)
          return null
        }
      } else {
        // No photo analysis was triggered (no upload and no listing photos)
        setPhotoError(true)
        return null
      }
    } catch (err) {
      console.warn('[photo-analysis] Error:', err)
      setPhotoError(true)
      return null
    }
  }, [])

  /** Set photo results directly from cache (Supabase, localStorage, demo data). */
  const setCachedResults = useCallback((results: PhotoAnalysisResult, previews?: string[] | null) => {
    setPhotoResults(results)
    if (previews) setPhotoPreviews(previews)
  }, [])

  /** Reset all photo state (results, previews, error). */
  const resetPhotoState = useCallback(() => {
    setPhotoResults(null)
    setPhotoPreviews(null)
    setPhotoError(false)
  }, [])

  return {
    photoResults,
    photoPreviews,
    photoError,
    analyzePhotos,
    setCachedResults,
    resetPhotoState,
  }
}
