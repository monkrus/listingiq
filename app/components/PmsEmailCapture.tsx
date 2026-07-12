'use client'
import { useState } from 'react'

interface Props {
  platform: 'hospitable' | 'hostex'
  connectionId: string
  onEmailSaved?: (email: string) => void
}

export default function PmsEmailCapture({ platform, connectionId, onEmailSaved }: Props) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const storageKey = `pms_email_${platform}`

  // Check if already saved
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem(storageKey)
    if (existing && !saved) {
      setSaved(true)
      return null
    }
  }

  if (saved) return null

  async function handleSave() {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/integrations/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, platform, connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save email')

      localStorage.setItem(storageKey, trimmed)
      setSaved(true)
      onEmailSaved?.(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save email')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-stone-200 rounded-xl p-3 mb-4 bg-stone-50">
      <p className="text-xs text-stone-600 mb-2">
        Save your email to access reports from any device
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="your@email.com"
          className="flex-1 h-9 px-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900 outline-none focus:border-stone-400 placeholder-stone-300"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ fontFamily: 'var(--font-syne)' }}
          className="px-4 h-9 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
