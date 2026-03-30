/**
 * In-memory session usage tracker.
 * Prevents session ID reuse by limiting how many API calls each paid session can make.
 *
 * Quick Score: 1 analysis
 * Full Audit:  1 analysis + 1 photo analysis
 */

interface SessionUsage {
  analyzeCount: number
  photoCount: number
  plan: string
  createdAt: number
}

const sessions = new Map<string, SessionUsage>()

const PLAN_LIMITS: Record<string, { analyze: number; photo: number }> = {
  'quick-score': { analyze: 1, photo: 0 },
  'full-audit':  { analyze: 1, photo: 1 },
}

// Clean up sessions older than 24 hours every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60_000
  sessions.forEach((usage, key) => {
    if (usage.createdAt < cutoff) sessions.delete(key)
  })
}, 30 * 60_000)

/**
 * Pre-register a session from the Stripe webhook.
 * Called when checkout.session.completed fires, before the user hits the API.
 */
export function registerPaidSession(sessionId: string, plan: string): void {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { analyzeCount: 0, photoCount: 0, plan, createdAt: Date.now() })
    console.log(`[session-usage] Registered: ${sessionId} plan=${plan}`)
  }
}

/**
 * Get or create a session entry.
 * Called when the session is first seen by an API route (fallback if webhook hasn't fired yet).
 */
function ensureSession(sessionId: string, plan: string): SessionUsage {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { analyzeCount: 0, photoCount: 0, plan, createdAt: Date.now() })
  }
  return sessions.get(sessionId)!
}

/**
 * Check and consume an analysis credit for this session.
 * Returns { allowed: true } if the session has remaining credits, false otherwise.
 */
export function useAnalysisCredit(sessionId: string, plan: string): { allowed: boolean; error?: string } {
  const usage = ensureSession(sessionId, plan)
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['quick-score']

  if (usage.analyzeCount >= limits.analyze) {
    return { allowed: false, error: 'This payment session has already been used for an analysis. Please purchase a new report.' }
  }

  usage.analyzeCount++
  return { allowed: true }
}

/**
 * Check and consume a photo analysis credit for this session.
 */
export function usePhotoCredit(sessionId: string, plan: string): { allowed: boolean; error?: string } {
  const usage = ensureSession(sessionId, plan)
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['quick-score']

  if (limits.photo === 0) {
    return { allowed: false, error: 'Photo analysis is not included in your plan.' }
  }

  if (usage.photoCount >= limits.photo) {
    return { allowed: false, error: 'Photo analysis has already been used for this session. Please purchase a new report.' }
  }

  usage.photoCount++
  return { allowed: true }
}
