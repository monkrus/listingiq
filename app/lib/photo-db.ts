'use client'

/**
 * IndexedDB storage for photos that need to survive Stripe redirect.
 * Falls back gracefully if IndexedDB is unavailable.
 */

interface StoredPhoto {
  buffer: ArrayBuffer
  name: string
  type: string
}

const DB_NAME = 'listingiq'
const STORE_NAME = 'photos'
const KEY = 'pending'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePendingPhotos(files: File[]): Promise<void> {
  try {
    const photos: StoredPhoto[] = await Promise.all(
      files.map(async f => ({
        buffer: await f.arrayBuffer(),
        name: f.name,
        type: f.type,
      }))
    )
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(photos, KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch (err) {
    console.warn('[photo-db] Failed to save photos:', err)
  }
}

export async function getPendingPhotos(): Promise<File[] | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY)
      req.onsuccess = () => {
        db.close()
        const photos = req.result as StoredPhoto[] | undefined
        if (!photos?.length) { resolve(null); return }
        const files = photos.map(p => new File([p.buffer], p.name, { type: p.type }))
        resolve(files)
      }
      req.onerror = () => { db.close(); reject(req.error) }
    })
  } catch (err) {
    console.warn('[photo-db] Failed to retrieve photos:', err)
    return null
  }
}

export async function clearPendingPhotos(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    // silent — cleanup failure is non-critical
  }
}
