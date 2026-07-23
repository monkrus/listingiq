/**
 * Temporary storage for pre-payment photo uploads.
 * Photos are stored before Stripe checkout and retrieved after payment.
 * 30-minute TTL.
 *
 * Uses disk (/tmp) as primary storage so uploads survive server restarts
 * (critical for the Stripe redirect flow). Falls back to in-memory if
 * disk write fails.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface StoredPhoto {
  base64: string
  mediaType: string
  filename: string
}

interface PhotoUpload {
  photos: StoredPhoto[]
  createdAt: number
}

const TTL = 30 * 60_000 // 30 minutes
const MAX_ENTRIES = 50
const STORE_DIR = join(tmpdir(), 'listingiq-photo-uploads')

// In-memory fallback
const memStore = new Map<string, PhotoUpload>()

// Ensure directory exists
try {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
} catch {
  console.warn('[photo-store] Cannot create temp dir, using memory-only mode')
}

function diskPath(uploadId: string): string {
  // Sanitize uploadId to prevent path traversal
  const safe = uploadId.replace(/[^a-zA-Z0-9_-]/g, '')
  return join(STORE_DIR, `${safe}.json`)
}

function writeToDisk(uploadId: string, upload: PhotoUpload): boolean {
  try {
    writeFileSync(diskPath(uploadId), JSON.stringify(upload))
    return true
  } catch {
    return false
  }
}

function readFromDisk(uploadId: string): PhotoUpload | null {
  try {
    const raw = readFileSync(diskPath(uploadId), 'utf-8')
    return JSON.parse(raw) as PhotoUpload
  } catch {
    return null
  }
}

function deleteFromDisk(uploadId: string): void {
  try { unlinkSync(diskPath(uploadId)) } catch { /* ignore */ }
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - TTL

  // Clean memory
  memStore.forEach((entry, key) => {
    if (entry.createdAt < cutoff) memStore.delete(key)
  })

  // Clean disk
  try {
    if (!existsSync(STORE_DIR)) return
    for (const file of readdirSync(STORE_DIR)) {
      const path = join(STORE_DIR, file)
      try {
        const stat = statSync(path)
        if (stat.mtimeMs < cutoff) unlinkSync(path)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}, 5 * 60_000)

export function storePhotos(uploadId: string, photos: StoredPhoto[]): boolean {
  if (memStore.size >= MAX_ENTRIES) {
    console.warn('[photo-store] Max entries reached, rejecting upload')
    return false
  }
  const upload: PhotoUpload = { photos, createdAt: Date.now() }
  memStore.set(uploadId, upload)
  writeToDisk(uploadId, upload) // best-effort disk persistence
  return true
}

export function getPhotos(uploadId: string): StoredPhoto[] | null {
  // Try memory first (fastest)
  const memEntry = memStore.get(uploadId)
  if (memEntry) {
    if (Date.now() - memEntry.createdAt > TTL) {
      memStore.delete(uploadId)
      deleteFromDisk(uploadId)
      return null
    }
    return memEntry.photos
  }

  // Fall back to disk (survives server restart)
  const diskEntry = readFromDisk(uploadId)
  if (!diskEntry) return null
  if (Date.now() - diskEntry.createdAt > TTL) {
    deleteFromDisk(uploadId)
    return null
  }

  // Re-populate memory cache
  memStore.set(uploadId, diskEntry)
  return diskEntry.photos
}

export function deletePhotos(uploadId: string): void {
  memStore.delete(uploadId)
  deleteFromDisk(uploadId)
}
