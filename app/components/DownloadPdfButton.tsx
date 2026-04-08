'use client'
import dynamic from 'next/dynamic'
import { ReportData } from '@/app/lib/types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

const PdfLinkInner = dynamic(
  () => import('./pdf/PdfLinkInner'),
  {
    ssr: false,
    loading: () => (
      <button
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-500 text-sm font-bold rounded-xl cursor-not-allowed"
      >
        Preparing PDF...
      </button>
    ),
  }
)

interface Props {
  data: ReportData
  photoResults?: PhotoAnalysisResult | null
  photoPreviews?: string[]
  listingUrl?: string
  plan?: string
  className?: string
}

export default function DownloadPdfButton({ data, photoResults, photoPreviews, listingUrl, plan, className }: Props) {
  return <PdfLinkInner data={data} photoResults={photoResults} photoPreviews={photoPreviews} listingUrl={listingUrl} plan={plan} className={className} />
}
