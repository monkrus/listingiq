import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ListingIQ <hello@listingiq.pro>'

/** Escape HTML to prevent injection from AI-generated or user content */
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function scoreColor(s: number): string {
  return s >= 80 ? '#4a7c2f' : s >= 60 ? '#b45309' : '#b91c1c'
}

function scoreBar(score: number): string {
  return `
    <td style="width:60px;text-align:center;padding:8px 4px;">
      <div style="font-size:20px;font-weight:700;color:${scoreColor(score)};">${score}</div>
      <div style="background:#f5f5f4;border-radius:4px;height:4px;margin-top:4px;">
        <div style="background:${scoreColor(score)};border-radius:4px;height:4px;width:${score}%;"></div>
      </div>
    </td>`
}

function buildReportHtml(report: Record<string, unknown>, planName: string, photoScore?: number | null): string {
  const d = report as Record<string, any>

  // Score cards — include photo score for Full Audit
  const scores: { label: string; v: number }[] = [
    { label: 'Title', v: d.titleScore },
    { label: 'Desc', v: d.descriptionScore },
    ...(typeof photoScore === 'number' ? [{ label: 'Photos', v: photoScore }] : []),
    { label: 'Amenities', v: d.amenityScore },
    { label: 'Persona', v: d.personaScore },
    { label: 'Reviews', v: d.reviewScore },
  ]

  const scoreCards = scores.map(s => `
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:10px;color:#78716c;text-transform:uppercase;letter-spacing:0.5px;">${s.label}</div>
      <div style="font-size:20px;font-weight:700;color:${scoreColor(s.v)};">${s.v}</div>
    </td>`).join('')

  // Priority actions
  const actions = (d.priorityActions || []).slice(0, 5).map((a: string, i: number) => `
    <tr>
      <td style="padding:6px 0;color:#57534e;font-size:14px;line-height:1.5;border-bottom:1px solid #f5f5f4;">
        <strong style="color:#b45309;">${i + 1}.</strong> ${esc(a)}
      </td>
    </tr>`).join('')

  // Title suggestions
  const titles = (d.titleSuggestions || []).slice(0, 3).map((t: string) => `
    <tr><td style="padding:4px 0;color:#1c1917;font-size:14px;">&rarr; ${esc(t)}</td></tr>`).join('')

  // Amenity gaps
  const gaps = (d.amenityGaps || []).slice(0, 3).map((g: string) => `
    <tr><td style="padding:3px 0;color:#57534e;font-size:13px;">&bull; ${esc(g)}</td></tr>`).join('')

  // Top amenities
  const topAmenities = (d.topAmenities || []).slice(0, 3).map((a: string) => `
    <span style="display:inline-block;background:#f5f5f4;color:#57534e;font-size:12px;padding:3px 10px;border-radius:12px;margin:2px 4px 2px 0;">${esc(a)}</span>`).join('')

  // SEO keywords
  const keywords = (d.seoKeywords || []).slice(0, 5).map((k: string) => `
    <span style="display:inline-block;background:#f0fdf4;color:#166534;font-size:11px;padding:2px 8px;border-radius:8px;margin:2px 3px 2px 0;">${esc(k)}</span>`).join('')

  return `
    <!-- Overall Score -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="text-align:center;padding:20px;background:#fafaf9;border-radius:12px;">
          <div style="font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;">Overall Score</div>
          <div style="font-size:48px;font-weight:800;color:${scoreColor(d.overallScore)};line-height:1.2;">${esc(d.overallScore)}</div>
          <div style="font-size:13px;color:#78716c;margin-top:4px;">${esc(d.estimatedImprovement)}</div>
        </td>
      </tr>
    </table>

    <!-- Sub Scores -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>${scoreCards}</tr>
    </table>

    <!-- Summary -->
    <p style="margin:0 0 20px;color:#1c1917;font-size:15px;line-height:1.6;font-style:italic;border-left:3px solid #10b981;padding-left:12px;">
      ${esc(d.summary)}
    </p>

    <!-- Priority Actions -->
    ${actions ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:8px;">Priority Action Plan</td></tr>
      ${actions}
    </table>` : ''}

    <!-- Title Suggestions -->
    ${titles ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td style="font-size:12px;font-weight:700;color:#1c1917;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Suggested Titles</td></tr>
      ${titles}
    </table>` : ''}

    <!-- Top Amenities -->
    ${topAmenities ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#1c1917;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Your Strongest Amenities</div>
      ${topAmenities}
    </div>` : ''}

    <!-- Amenity Gaps -->
    ${gaps ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td style="font-size:12px;font-weight:700;color:#1c1917;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Consider Adding</td></tr>
      ${gaps}
    </table>` : ''}

    <!-- SEO Keywords -->
    ${keywords ? `
    <div style="margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#1c1917;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">SEO Keywords</div>
      ${keywords}
    </div>` : ''}

    <!-- Divider before CTA -->
    <hr style="border:none;border-top:1px solid #e7e5e4;margin:20px 0;">
    <p style="margin:0 0 4px;color:#78716c;font-size:13px;text-align:center;">
      View the full report with description rewrite, photo tips, and PDF download:
    </p>`
}

/**
 * Send a report email after purchase.
 * Includes the actual report content (scores, actions, suggestions)
 * plus a link to the full interactive report with PDF download.
 */
export async function sendReceiptEmail(opts: {
  to: string
  plan: string
  sessionId: string
  reportData?: Record<string, unknown>
  photoScore?: number | null
}) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping email')
    return
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://listingiq.pro'
  const reportUrl = `${baseUrl}/success?session_id=${opts.sessionId}`
  const planName = opts.plan === 'full-audit' ? 'Full Audit' : 'Quick Score'
  const planPrice = opts.plan === 'full-audit' ? '$49' : '$29'

  const reportSection = opts.reportData ? buildReportHtml(opts.reportData, planName, opts.photoScore) : ''

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: 'support@listingiq.pro',
      to: opts.to,
      subject: `Your ListingIQ ${planName} report is ready`,
      text: `Your ListingIQ ${planName} Report is Ready\n\nThanks for your purchase! Your ${planName} (${planPrice}) analysis is complete.\n\nView your report: ${reportUrl}\n\nTip: Download the PDF from the results page if you'd like an offline copy.\n\n© ${new Date().getFullYear()} ListingIQ`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1c1917;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">ListingIQ</h1>
              <p style="margin:8px 0 0;color:#a8a29e;font-size:13px;">${planName} Report</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1c1917;font-size:20px;">Your report is ready</h2>
              <p style="margin:0 0 24px;color:#57534e;font-size:15px;line-height:1.6;">
                Thanks for your purchase! Your ${planName} (${planPrice}) analysis is complete.
              </p>

              ${reportSection}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0 24px;">
                    <a href="${reportUrl}" style="display:inline-block;background:#10b981;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;letter-spacing:0.3px;">
                      View full report &amp; download PDF
                    </a>
                  </td>
                </tr>
              </table>
              ${opts.plan === 'full-audit' ? `
              <p style="margin:0 0 16px;color:#57534e;font-size:14px;line-height:1.6;">
                Your Full Audit includes AI photo analysis with per-photo feedback and a recommended gallery order — available in the full report above.
              </p>` : ''}
              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0;">
              <p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">
                If the button doesn't work, copy this link into your browser:<br>
                <a href="${reportUrl}" style="color:#10b981;word-break:break-all;">${reportUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fafaf9;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#a8a29e;font-size:12px;">
                &copy; ${new Date().getFullYear()} ListingIQ &middot; AI-powered Airbnb listing optimization
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    })

  } catch (err) {
    console.error('[email] Failed to send:', err instanceof Error ? err.message : err)
  }
}
