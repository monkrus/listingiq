import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ListingIQ — Airbnb Listing Analyzer',
  description: 'AI-powered Airbnb listing score and optimization report in 20 seconds.',
  openGraph: {
    title: 'ListingIQ — Airbnb Listing Analyzer',
    description: 'AI-powered Airbnb listing score and optimization report in 20 seconds.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ListingIQ — Airbnb Listing Analyzer',
    description: 'AI-powered Airbnb listing score and optimization report in 20 seconds.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
