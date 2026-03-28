import PhotoUploader from '@/app/components/PhotoUploader'
import Link from 'next/link'

export default function PhotosPage() {
  return (
    <main className="min-h-screen py-12" style={{ background: '#F7F6F3' }}>
      <div className="max-w-2xl mx-auto px-4 text-center mb-8">
        <div style={{ fontFamily: 'var(--font-syne)' }}
          className="text-xs font-bold tracking-widest text-stone-600 uppercase mb-2">
          ListingIQ · Photo Analyzer
        </div>
        <h1 style={{ fontFamily: 'var(--font-syne)' }}
          className="text-3xl font-bold text-stone-900 mb-2">
          AI photo critique
        </h1>
        <p className="text-stone-600 text-sm">
          Upload your listing photos. Claude Vision scores each one, flags what to retake,<br />
          and tells you exactly how to reshoot it.
        </p>
        <div className="flex justify-center gap-4 mt-5 text-xs text-stone-600">
          <Link href="/" className="hover:text-stone-600 underline">← Back to listing analyzer</Link>
          <span>·</span>
          <Link href="/pricing" className="hover:text-stone-600 underline">Pricing</Link>
        </div>
      </div>
      <PhotoUploader />
    </main>
  )
}
