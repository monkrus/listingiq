'use client'
import { useState, useRef, useCallback } from 'react'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTOS = 10
const MAX_FILE_SIZE = 4 * 1024 * 1024

interface Props {
  onContinue: (files: File[], previews: string[]) => void
  onSkip?: () => void
  uploading?: boolean
}

export default function PhotoUploadStep({ onContinue, onSkip, uploading }: Props) {
  const [previews, setPreviews] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const rejected = arr.filter(f => !ALLOWED_TYPES.includes(f.type))
    const tooLarge = arr.filter(f => ALLOWED_TYPES.includes(f.type) && f.size > MAX_FILE_SIZE)
    const valid = arr.filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE)

    const messages: string[] = []
    if (rejected.length > 0) messages.push(`${rejected.length} file${rejected.length > 1 ? 's' : ''} skipped — only JPG, PNG, and WebP accepted.`)
    if (tooLarge.length > 0) messages.push(`${tooLarge.length} file${tooLarge.length > 1 ? 's' : ''} too large (max 4 MB each).`)
    if (!valid.length) { if (messages.length) setError(messages.join(' ')); return }

    const existingKeys = new Set(files.map(f => `${f.name}_${f.size}`))
    const unique = valid.filter(f => !existingKeys.has(`${f.name}_${f.size}`))
    if (!unique.length) { if (messages.length) setError(messages.join(' ')); return }

    const spotsLeft = MAX_PHOTOS - files.length
    if (spotsLeft <= 0) { setError(`Maximum ${MAX_PHOTOS} photos reached. Remove some to add more.`); return }

    const toAdd = unique.slice(0, spotsLeft)
    const skipped = unique.length - toAdd.length
    if (skipped > 0) messages.push(`${skipped} photo${skipped > 1 ? 's' : ''} skipped — maximum ${MAX_PHOTOS} photos.`)

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
  }

  return (
    <div>
      <div className="text-center mb-4">
        <p style={{ fontFamily: 'var(--font-syne)' }} className="text-sm font-bold text-stone-900 mb-1">
          Upload your listing photos
        </p>
        <p className="text-xs text-stone-600">
          We&apos;ll analyze them together with your listing text for a complete report.
        </p>
      </div>

      {files.length === 0 ? (
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          htmlFor="photo-step-input"
          className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-stone-400 bg-stone-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
          }`}
        >
          <div className="text-2xl mb-2">⬆</div>
          <p className="text-sm text-stone-600">Drop photos here or click to browse</p>
          <p className="text-xs text-stone-400 mt-1">Up to 10 photos · JPG, PNG, WebP · 4 MB max each</p>
          <input
            ref={inputRef}
            id="photo-step-input"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={e => { e.target.files && addFiles(e.target.files); e.target.value = '' }}
          />
        </label>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-stone-600">{files.length}/{MAX_PHOTOS} photos</span>
            <div className="flex gap-3">
              {files.length < MAX_PHOTOS && (
                <label htmlFor="photo-step-input" className="text-xs text-blue-500 hover:text-blue-700 underline cursor-pointer">
                  Add more
                </label>
              )}
              <button onClick={() => { setFiles([]); setPreviews([]); setError('') }} className="text-xs text-stone-500 hover:text-stone-600 underline">
                Clear all
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {previews.map((src, i) => (
              <div key={i} className="relative group">
                <img src={src} className="w-full h-16 object-cover rounded-xl border border-stone-200" alt="" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-stone-800 text-white rounded-full text-xs flex items-center justify-center sm:hidden sm:group-hover:flex"
                >×</button>
                <span className="absolute bottom-1 left-1 bg-stone-900/60 text-white text-xs px-1 rounded">{i + 1}</span>
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            id="photo-step-input"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={e => { e.target.files && addFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-2 mb-3 text-center">{error}</p>}

      <button
        onClick={() => onContinue(files, previews)}
        disabled={!files.length || uploading}
        style={{ fontFamily: 'var(--font-syne)' }}
        className="w-full py-3 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 disabled:opacity-40 transition-colors tracking-wide mt-3"
      >
        {uploading ? 'Uploading photos...' : 'Continue to payment'}
      </button>
      {onSkip && !uploading && (
        <button
          onClick={onSkip}
          className="w-full py-2 text-xs text-stone-500 hover:text-stone-700 underline mt-2"
        >
          Skip — use listing photos instead
        </button>
      )}
    </div>
  )
}
