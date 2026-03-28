'use client'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { ReportDocument } from './ReportDocument'
import { ReportData } from '@/app/lib/types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

interface Props {
  data: ReportData
  photoResults?: PhotoAnalysisResult | null
  photoPreviews?: string[]
  className?: string
}

export default function PdfLinkInner({ data, photoResults, photoPreviews, className }: Props) {
  const filename = `listingiq-report-${new Date().toISOString().slice(0, 10)}.pdf`

  return (
    <PDFDownloadLink
      document={<ReportDocument data={data} photoResults={photoResults} photoPreviews={photoPreviews} />}
      fileName={filename}
      className={className}
    >
      {({ loading, error }) => {
        if (error) {
          return (
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm font-bold rounded-xl">
              PDF error
            </span>
          )
        }
        return (
          <span
            style={{ fontFamily: 'var(--font-syne)' }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-700 transition-colors cursor-pointer tracking-wide"
          >
            {loading ? 'Building PDF...' : 'Download PDF'}
          </span>
        )
      }}
    </PDFDownloadLink>
  )
}
