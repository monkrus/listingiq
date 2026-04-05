/**
 * Temporary in-memory storage for pre-payment photo uploads.
 * Photos are stored before Stripe checkout and retrieved after payment.
 * 30-minute TTL — if the server restarts, user can still upload on the report page.
 */

export interface StoredPhoto {
  base64: string
  mediaType: string
  filename: string
}

interface PhotoUpload {
  photos: StoredPhoto[]
  createdAt: number
}

const store = new Map<string, PhotoUpload>()
const TTL = 30 * 60_000 // 30 minutes
const MAX_ENTRIES = 50

// Cleanup every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - TTL
  store.forEach((entry, key) => {
    if (entry.createdAt < cutoff) store.delete(key)
  })
}, 5 * 60_000)

export function storePhotos(uploadId: string, photos: StoredPhoto[]): boolean {
  if (store.size >= MAX_ENTRIES) {
    console.warn('[photo-store] Max entries reached, rejecting upload')
    return false
  }
  store.set(uploadId, { photos, createdAt: Date.now() })
  console.log(`[photo-store] Stored ${photos.length} photos as ${uploadId}`)
  return true
}

export function getPhotos(uploadId: string): StoredPhoto[] | null {
  const entry = store.get(uploadId)
  if (!entry) return null
  if (Date.now() - entry.createdAt > TTL) {
    store.delete(uploadId)
    return null
  }
  return entry.photos
}

export function deletePhotos(uploadId: string): void {
  store.delete(uploadId)
}
