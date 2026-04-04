import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ListingIQ <noreply@listingiq.pro>'

/**
 * Send a receipt/confirmation email after purchase.
 * Contains a link back to the success page with their session ID
 * so they can re-access the report.
 */
export async function sendReceiptEmail(opts: {
  to: string
  plan: string
  sessionId: string
}) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping email')
    return
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://listingiq.pro'
  const reportUrl = `${baseUrl}/success?session_id=${opts.sessionId}`
  const planName = opts.plan === 'full-audit' ? 'Full Audit' : 'Quick Score'
  const planPrice = opts.plan === 'full-audit' ? '$49' : '$29'

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `Your ListingIQ ${planName} report is ready`,
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
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1c1917;font-size:20px;">Your report is ready</h2>
              <p style="margin:0 0 24px;color:#57534e;font-size:15px;line-height:1.6;">
                Thanks for your purchase! Your ${planName} (${planPrice}) analysis is complete and waiting for you.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${reportUrl}" style="display:inline-block;background:#10b981;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;letter-spacing:0.3px;">
                      View your report
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;color:#57534e;font-size:14px;line-height:1.6;">
                <strong>Important:</strong> Download the PDF or copy the report text from the results page. Reports are generated on-demand and not stored permanently.
              </p>
              ${opts.plan === 'full-audit' ? `
              <p style="margin:0 0 16px;color:#57534e;font-size:14px;line-height:1.6;">
                Your Full Audit includes photo analysis — upload up to 10 listing photos on the results page to get per-photo feedback and a recommended gallery order.
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

    console.log(`[email] Receipt sent to ${opts.to} for ${planName}`)
  } catch (err) {
    console.error('[email] Failed to send:', err instanceof Error ? err.message : err)
  }
}
