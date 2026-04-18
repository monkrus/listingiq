'use client'
import { useState } from 'react'

interface Props {
  title: string
  score: number | null
  children: React.ReactNode
  defaultOpen?: boolean
}

function pillStyle(s: number) {
  if (s >= 80) return 'bg-green-100 text-green-800'
  if (s >= 60) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export default function ReportSection({ title, score, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: 'var(--font-syne)' }} className="font-bold text-sm text-stone-900">
            {title}
          </span>
          {score !== null && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${pillStyle(score)}`}>
              {score}/100
            </span>
          )}
        </div>
        <span className="text-stone-500 text-xs transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-stone-100 text-sm text-stone-700 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}
