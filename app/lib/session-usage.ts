/**
 * Session usage tracker with Stripe metadata persistence.
 * Uses in-memory cache for speed, Stripe session metadata for durability.
 * Survives container restarts by checking Stripe metadata as source of truth.
 *
 * Quick Score: 1 analysis
 * Full Audit:  1 analysis + 1 photo analysis
 */

import { stripe } from './stripe'

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
 */
export function registerPaidSession(sessionId: string, plan: string): void {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { analyzeCount: 0, photoCount: 0, plan, createdAt: Date.now() })
    console.log(`[session-usage] Registered: ${sessionId} plan=${plan}`)
  }
}

/**
 * Load usage state from Stripe metadata if not in memory.
 */
async function ensureSessionFromStripe(sessionId: string, plan: string): Promise<SessionUsage> {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!
  }

  // Check Stripe metadata for prior usage (survives restarts)
  try {
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
    const meta = stripeSession.metadata || {}
    const usage: SessionUsage = {
      analyzeCount: meta.analyze_used === 'true' ? 1 : 0,
      photoCount: meta.photo_used === 'true' ? 1 : 0,
      plan: meta.planKey || plan,
      createdAt: Date.now(),
    }
    sessions.set(sessionId, usage)
    return usage
  } catch {
    // Fallback: create fresh entry
    const usage: SessionUsage = { analyzeCount: 0, photoCount: 0, plan, createdAt: Date.now() }
    sessions.set(sessionId, usage)
    return usage
  }
}

/**
 * Mark a credit as used in Stripe metadata (persistent).
 */
async function markUsedInStripe(sessionId: string, field: 'analyze_used' | 'photo_used'): Promise<void> {
  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: { [field]: 'true' },
    })
  } catch (err) {
    console.error(`[session-usage] Failed to update Stripe metadata for ${sessionId}:`, err)
  }
}

/**
 * Check and consume an analysis credit for this session.
 */
export async function useAnalysisCredit(sessionId: string, plan: string, opts?: { reaccess?: boolean }): Promise<{ allowed: boolean; error?: string }> {
  const usage = await ensureSessionFromStripe(sessionId, plan)
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['quick-score']

  if (usage.analyzeCount >= limits.analyze) {
    // Allow re-access from email link (same session, same listing)
    if (opts?.reaccess) {
      return { allowed: true }
    }
    return { allowed: false, error: 'This payment session has already been used for an analysis. Please purchase a new report.' }
  }

  usage.analyzeCount++
  await markUsedInStripe(sessionId, 'analyze_used')
  return { allowed: true }
}

/**
 * Check and consume a photo analysis credit for this session.
 */
export async function usePhotoCredit(sessionId: string, plan: string): Promise<{ allowed: boolean; error?: string }> {
  const usage = await ensureSessionFromStripe(sessionId, plan)
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['quick-score']

  if (limits.photo === 0) {
    return { allowed: false, error: 'Photo analysis is not included in your plan.' }
  }

  if (usage.photoCount >= limits.photo) {
    return { allowed: false, error: 'Photo analysis has already been used for this session. Please purchase a new report.' }
  }

  usage.photoCount++
  await markUsedInStripe(sessionId, 'photo_used')
  return { allowed: true }
}
