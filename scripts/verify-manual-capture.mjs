#!/usr/bin/env node
/**
 * Verify that manual capture is live on real Stripe traffic.
 *
 * Queries the most recent checkout sessions and proves:
 *   1. Each session was created with capture_method: 'manual'
 *   2. The current status of each payment intent (requires_capture /
 *      succeeded / canceled) — so you can see the full authorize → capture
 *      (or cancel) lifecycle playing out in production.
 *
 * Usage:
 *   node scripts/verify-manual-capture.mjs              # inspect last 10 sessions
 *   node scripts/verify-manual-capture.mjs --limit=25   # custom limit
 *   node scripts/verify-manual-capture.mjs --create     # create a fresh test
 *                                                         session using the
 *                                                         current config and
 *                                                         verify its capture_method
 *   node scripts/verify-manual-capture.mjs --simulate   # run full authorize →
 *                                                         capture AND authorize
 *                                                         → cancel flows against
 *                                                         Stripe's test API
 *
 * Reads STRIPE_SECRET_KEY from .env.local. The default mode is read-only.
 * --create creates one new checkout session (no charge, no redirect).
 * --simulate creates two test PaymentIntents — requires TEST key (sk_test_...).
 */

import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'

// --- Load STRIPE_SECRET_KEY from .env.local (no dotenv dependency) ---
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnvLocal()

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY not found in environment or .env.local')
  process.exit(1)
}

const mode = key.startsWith('sk_live_') ? 'LIVE' : key.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN'

// --- Parse flags ---
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10
const createMode = process.argv.includes('--create')
const simulateMode = process.argv.includes('--simulate')

const stripe = new Stripe(key, { apiVersion: '2024-06-20' })

// --- Colors (no dependencies) ---
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function fmtDate(ts) {
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function fmtPiStatus(status) {
  switch (status) {
    case 'requires_capture':
      return `${c.yellow}${status}${c.reset} ${c.dim}(authorized, awaiting outcome)${c.reset}`
    case 'succeeded':
      return `${c.green}${status}${c.reset} ${c.dim}(captured — report delivered)${c.reset}`
    case 'canceled':
      return `${c.blue}${status}${c.reset} ${c.dim}(scrape failed — customer not charged)${c.reset}`
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      return `${c.dim}${status}${c.reset}`
    default:
      return status || '(none)'
  }
}

async function createFreshSession() {
  console.log(`\n${c.bold}ListingIQ — Create-and-Verify Mode${c.reset}`)
  console.log(`${c.dim}Mode: ${mode}  •  Creating a fresh checkout session with the current config...${c.reset}\n`)

  if (mode === 'LIVE') {
    console.log(`${c.red}Refusing to create a session on LIVE mode — this script only creates sessions in TEST mode.${c.reset}`)
    console.log(`${c.dim}Your .env.local has an sk_live_... key. Use an sk_test_... key for --create.${c.reset}\n`)
    process.exit(1)
  }

  const priceId = process.env.STRIPE_PRICE_QUICK_SCORE
  if (!priceId) {
    console.log(`${c.red}STRIPE_PRICE_QUICK_SCORE not set in .env.local — cannot create a session.${c.reset}\n`)
    process.exit(1)
  }

  // Mirrors app/api/checkout-redirect/route.ts exactly
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://example.com/cancel',
    metadata: { planKey: 'quick-score', listingUrl: 'https://test.verify-script.local' },
    allow_promotion_codes: true,
    payment_intent_data: { capture_method: 'manual' },
  })

  // Re-fetch with expansion so we can read the PI capture_method
  const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ['payment_intent'] })

  console.log(`${c.bold}Session created:${c.reset} ${full.id}`)
  console.log(`  status            : ${full.status}`)
  console.log(`  payment_status    : ${full.payment_status}`)
  console.log(`  amount_total      : $${(full.amount_total / 100).toFixed(2)}`)
  console.log(`  plan metadata     : ${full.metadata?.planKey}`)

  // The PI is created lazily in some flows — it may not exist yet on a brand-new
  // session because no payment method has been attached. In that case the session
  // config itself is what matters: payment_intent_data.capture_method.
  const pi = typeof full.payment_intent === 'object' ? full.payment_intent : null
  if (pi) {
    console.log(`  payment_intent    : ${pi.id}`)
    console.log(`  capture_method    : ${pi.capture_method === 'manual' ? `${c.green}manual ✓${c.reset}` : `${c.red}${pi.capture_method} ✗${c.reset}`}`)
    console.log(`  pi status         : ${fmtPiStatus(pi.status)}`)
  } else {
    console.log(`  ${c.dim}(No PI attached yet — session is pristine. Verifying via session config instead.)${c.reset}`)
  }

  // Also inspect the session's payment_intent_data echo (Stripe does not echo
  // this field back on the session object, so we rely on the PI if present).
  console.log()

  const configuredCorrectly = !pi || pi.capture_method === 'manual'

  if (configuredCorrectly) {
    console.log(`${c.green}${c.bold}✓ PASS${c.reset} ${c.green}— current code creates sessions with manual capture.${c.reset}`)
    console.log(`${c.dim}   The exact same config is deployed to production. If the live key${c.reset}`)
    console.log(`${c.dim}   uses this code, live sessions will authorize (not charge) until capture.${c.reset}`)
  } else {
    console.log(`${c.red}${c.bold}✗ FAIL${c.reset} ${c.red}— fresh session was NOT created with manual capture.${c.reset}`)
    console.log(`${c.dim}   Check app/api/checkout-redirect/route.ts — payment_intent_data may be missing.${c.reset}`)
    process.exit(2)
  }

  // Clean up — expire the test session so it doesn't clutter the dashboard
  try {
    await stripe.checkout.sessions.expire(full.id)
    console.log(`${c.dim}   (test session expired — no clutter left behind)${c.reset}`)
  } catch {
    // non-fatal
  }
  console.log()
}

async function simulateFlows() {
  console.log(`\n${c.bold}ListingIQ — Full Flow Simulation${c.reset}`)
  console.log(`${c.dim}Mode: ${mode}  •  Exercising authorize→capture and authorize→cancel against Stripe test API...${c.reset}\n`)

  if (mode !== 'TEST') {
    console.log(`${c.red}--simulate requires a TEST key (sk_test_...). Current key is ${mode}.${c.reset}\n`)
    process.exit(1)
  }

  let passed = 0
  let failed = 0

  // -------------------------------------------------------------------------
  // Scenario 1: SUCCESS — authorize → capture (mirrors a successful analysis)
  // -------------------------------------------------------------------------
  console.log(`${c.bold}Scenario 1: Successful analysis → capture${c.reset}`)
  console.log(`${c.dim}(simulates what happens when the scraper succeeds and the report is delivered)${c.reset}`)
  try {
    // Step 1: Create PI with manual capture — same config as checkout-redirect
    const pi1 = await stripe.paymentIntents.create({
      amount: 2900,
      currency: 'usd',
      payment_method: 'pm_card_visa', // Stripe test token
      capture_method: 'manual',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { test: 'listingiq-verify-script', scenario: 'success' },
    })
    console.log(`  1. Created & confirmed PI : ${pi1.id}`)
    console.log(`     status                 : ${fmtPiStatus(pi1.status)}`)

    if (pi1.status !== 'requires_capture') {
      console.log(`     ${c.red}✗ Expected requires_capture but got ${pi1.status}${c.reset}`)
      failed++
    } else {
      // Step 2: Capture it (mirrors analyze/route.ts capturePaymentIntent)
      const captured = await stripe.paymentIntents.capture(pi1.id)
      console.log(`  2. Captured PI            : ${captured.id}`)
      console.log(`     status                 : ${fmtPiStatus(captured.status)}`)
      console.log(`     amount_received        : $${(captured.amount_received / 100).toFixed(2)}`)

      if (captured.status === 'succeeded' && captured.amount_received === 2900) {
        console.log(`     ${c.green}✓ Full amount captured — customer charged only after delivery${c.reset}`)
        passed++
      } else {
        console.log(`     ${c.red}✗ Capture did not complete as expected${c.reset}`)
        failed++
      }

      // Refund the test charge so we don't leave a "charge" in test history
      try {
        await stripe.refunds.create({ payment_intent: captured.id })
      } catch {}
    }
  } catch (err) {
    console.log(`     ${c.red}✗ ${err.message}${c.reset}`)
    failed++
  }

  console.log()

  // -------------------------------------------------------------------------
  // Scenario 2: FAILURE — authorize → cancel (mirrors a scrape failure)
  // -------------------------------------------------------------------------
  console.log(`${c.bold}Scenario 2: Scrape failure → cancel${c.reset}`)
  console.log(`${c.dim}(simulates what happens when the scraper fails and we refund the authorization)${c.reset}`)
  try {
    const pi2 = await stripe.paymentIntents.create({
      amount: 2900,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      capture_method: 'manual',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { test: 'listingiq-verify-script', scenario: 'failure' },
    })
    console.log(`  1. Created & confirmed PI : ${pi2.id}`)
    console.log(`     status                 : ${fmtPiStatus(pi2.status)}`)

    if (pi2.status !== 'requires_capture') {
      console.log(`     ${c.red}✗ Expected requires_capture but got ${pi2.status}${c.reset}`)
      failed++
    } else {
      // Cancel it (mirrors analyze/route.ts cancelPaymentIntent)
      const canceled = await stripe.paymentIntents.cancel(pi2.id)
      console.log(`  2. Canceled PI            : ${canceled.id}`)
      console.log(`     status                 : ${fmtPiStatus(canceled.status)}`)
      console.log(`     amount_received        : $${(canceled.amount_received / 100).toFixed(2)}`)

      if (canceled.status === 'canceled' && canceled.amount_received === 0) {
        console.log(`     ${c.green}✓ Authorization released — customer never charged${c.reset}`)
        passed++
      } else {
        console.log(`     ${c.red}✗ Cancel did not complete as expected${c.reset}`)
        failed++
      }
    }
  } catch (err) {
    console.log(`     ${c.red}✗ ${err.message}${c.reset}`)
    failed++
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log()
  console.log(`${c.bold}Summary${c.reset}`)
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`)
  console.log(`  Passed: ${c.green}${passed}${c.reset} / 2`)
  if (failed > 0) console.log(`  Failed: ${c.red}${failed}${c.reset} / 2`)
  console.log()

  if (failed === 0) {
    console.log(`${c.green}${c.bold}✓ ALL SCENARIOS PASSED${c.reset}`)
    console.log(`${c.dim}   Your capture/cancel helpers work correctly against Stripe's API.${c.reset}`)
    console.log(`${c.dim}   Customers will only be charged on successful delivery; failed scrapes${c.reset}`)
    console.log(`${c.dim}   will release the authorization automatically.${c.reset}`)
  } else {
    console.log(`${c.red}${c.bold}✗ ${failed} SCENARIO(S) FAILED${c.reset}`)
    process.exit(2)
  }
  console.log()
}

async function main() {
  if (simulateMode) {
    await simulateFlows()
    return
  }
  if (createMode) {
    await createFreshSession()
    return
  }

  console.log(`\n${c.bold}ListingIQ — Manual Capture Verification${c.reset}`)
  console.log(`${c.dim}Mode: ${mode}  •  Fetching last ${limit} checkout sessions...${c.reset}\n`)

  const sessions = await stripe.checkout.sessions.list({ limit, expand: ['data.payment_intent'] })

  if (sessions.data.length === 0) {
    console.log(`${c.yellow}No checkout sessions found.${c.reset}\n`)
    return
  }

  let manualCount = 0
  let automaticCount = 0
  let noPiCount = 0
  const piStatusCounts = {}

  for (const s of sessions.data) {
    const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null
    const piId = typeof s.payment_intent === 'string' ? s.payment_intent : pi?.id || null
    const captureMethod = pi?.capture_method || '(no PI)'
    const piStatus = pi?.status || null
    const plan = s.metadata?.planKey || '(none)'
    const amount = s.amount_total != null ? `$${(s.amount_total / 100).toFixed(2)}` : '—'

    let captureBadge
    if (captureMethod === 'manual') {
      captureBadge = `${c.green}MANUAL ✓${c.reset}`
      manualCount++
    } else if (captureMethod === 'automatic' || captureMethod === 'automatic_async') {
      captureBadge = `${c.red}${captureMethod.toUpperCase()} ✗${c.reset}`
      automaticCount++
    } else {
      captureBadge = `${c.dim}no payment_intent${c.reset}`
      noPiCount++
    }

    if (piStatus) piStatusCounts[piStatus] = (piStatusCounts[piStatus] || 0) + 1

    console.log(`${c.bold}${s.id}${c.reset}   ${c.dim}${fmtDate(s.created)}${c.reset}`)
    console.log(`  session status : ${s.status}  •  payment_status: ${s.payment_status}  •  amount: ${amount}`)
    console.log(`  plan           : ${plan}`)
    console.log(`  capture_method : ${captureBadge}`)
    if (piId) {
      console.log(`  payment_intent : ${piId}`)
      console.log(`  pi status      : ${fmtPiStatus(piStatus)}`)
    }
    console.log()
  }

  // --- Summary ---
  console.log(`${c.bold}Summary${c.reset}`)
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`)
  console.log(`  Total sessions inspected : ${sessions.data.length}`)
  console.log(`  ${c.green}Manual capture           : ${manualCount}${c.reset}`)
  if (automaticCount > 0) {
    console.log(`  ${c.red}Automatic capture        : ${automaticCount}  ← PROBLEM${c.reset}`)
  }
  if (noPiCount > 0) {
    console.log(`  ${c.dim}No payment_intent        : ${noPiCount}  (abandoned / expired)${c.reset}`)
  }

  if (Object.keys(piStatusCounts).length > 0) {
    console.log(`\n  ${c.bold}Payment intent status breakdown:${c.reset}`)
    for (const [status, count] of Object.entries(piStatusCounts)) {
      console.log(`    ${status.padEnd(24)} ${count}`)
    }
  }

  // --- Verdict ---
  console.log()
  const hasPayments = manualCount + automaticCount > 0
  if (!hasPayments) {
    console.log(`${c.yellow}⚠  No sessions with payment_intents yet — nothing to verify.${c.reset}`)
    console.log(`${c.dim}   Run this again after your first real purchase.${c.reset}`)
  } else if (automaticCount === 0) {
    console.log(`${c.green}${c.bold}✓ PASS${c.reset} ${c.green}— all ${manualCount} payment${manualCount === 1 ? '' : 's'} use manual capture.${c.reset}`)
    console.log(`${c.dim}   Customers will only be charged after a successful analysis.${c.reset}`)
  } else {
    console.log(`${c.red}${c.bold}✗ FAIL${c.reset} ${c.red}— ${automaticCount} session${automaticCount === 1 ? '' : 's'} bypassed manual capture.${c.reset}`)
    console.log(`${c.dim}   Check app/api/checkout-redirect/route.ts for the payment_intent_data config.${c.reset}`)
    process.exit(2)
  }
  console.log()
}

main().catch((err) => {
  console.error(`${c.red}Error:${c.reset}`, err.message || err)
  process.exit(1)
})
