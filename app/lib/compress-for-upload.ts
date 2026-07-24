'use client'

const MAX_DIMENSION = 1200

/**
 * Compress an image file client-side using Canvas API.
 * Reduces upload payload to prevent HTTP/2 errors on large multipart uploads.
 * Output: JPEG at 85% quality, max 1200px on longest edge.
 */
export function compressForUpload(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img

      // Already small enough — skip compression
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 500_000) {
        resolve(file)
        return
      }

      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1)
      const w = Math.round(width * scale)
      const h = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }

      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified }))
        },
        'image/jpeg',
        0.85,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load ${file.name}`))
    }
    img.src = url
  })
}

/** Compress multiple files in parallel */
export function compressAllForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressForUpload))
}
