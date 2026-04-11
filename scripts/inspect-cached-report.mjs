#!/usr/bin/env node
/**
 * Inspect a cached_reports row in Supabase by session_id.
 *
 * Use this to diagnose "missing photo analysis" bugs on email re-access:
 *   - Confirms whether photo_results is NULL for a given session
 *   - Shows whether report_data contains photoUrls (needed for autoAnalyzePhotos
 *     fallback)
 *   - Prints the full row for manual inspection
 *
 * Usage:
 *   node scripts/inspect-cached-report.mjs cs_test_abc123
 *   node scripts/inspect-cached-report.mjs --latest 5     # inspect the 5 most
 *                                                           recent rows
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// --- Load .env.local ---
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      let val = m[2]
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      process.env[m[1]] = val
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const args = process.argv.slice(2)
const latestIdx = args.indexOf('--latest')
const latestMode = latestIdx !== -1

function summarize(row) {
  const reportData = row.report_data || {}
  const photoResults = row.photo_results
  const photoUrls = reportData.photoUrls
  const photoUrlsCount = Array.isArray(photoUrls) ? photoUrls.length : 0
  const photoCount = photoResults?.photos?.length ?? 0

  return {
    session_id: row.session_id,
    plan: row.plan,
    listing_url: row.listing_url,
    created_at: row.created_at,
    email_sent_at: row.email_sent_at,
    has_report_data: !!row.report_data,
    report_data_has_photoUrls: photoUrlsCount > 0,
    photoUrls_count: photoUrlsCount,
    has_photo_results: photoResults !== null && photoResults !== undefined,
    photo_results_count: photoCount,
    has_photo_previews: Array.isArray(row.photo_previews) && row.photo_previews.length > 0,
  }
}

async function main() {
  if (latestMode) {
    const limit = parseInt(args[latestIdx + 1] || '5', 10)
    const { data, error } = await db
      .from('cached_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('Query failed:', error); process.exit(1) }
    console.log(`\nLast ${data.length} cached_reports rows:\n`)
    for (const row of data) {
      console.log(JSON.stringify(summarize(row), null, 2))
      console.log('---')
    }
    const missingPhotos = data.filter(r =>
      r.plan === 'full-audit' && (r.photo_results === null || r.photo_results === undefined)
    )
    if (missingPhotos.length > 0) {
      console.log(`\n⚠  ${missingPhotos.length} full-audit row(s) missing photo_results:`)
      for (const r of missingPhotos) console.log(`   ${r.session_id}`)
    }
    return
  }

  const sessionId = args[0]
  if (!sessionId) {
    console.error('Usage: node scripts/inspect-cached-report.mjs <session_id>')
    console.error('       node scripts/inspect-cached-report.mjs --latest [n]')
    process.exit(1)
  }

  const { data, error } = await db
    .from('cached_reports')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) { console.error('Query failed:', error); process.exit(1) }
  if (!data) {
    console.log(`No row found for session_id=${sessionId}`)
    process.exit(0)
  }

  console.log('\nSummary:')
  console.log(JSON.stringify(summarize(data), null, 2))

  console.log('\nDiagnosis:')
  if (!data.photo_results && data.plan === 'full-audit') {
    console.log('  ✗ photo_results IS NULL — this session will show "Pending" + upload dropzone on re-access')
    const hasPhotoUrls = Array.isArray(data.report_data?.photoUrls) && data.report_data.photoUrls.length > 0
    if (hasPhotoUrls) {
      console.log('  ✓ report_data.photoUrls exists — autoAnalyzePhotos fallback SHOULD trigger on re-access')
    } else {
      console.log('  ✗ report_data.photoUrls is also missing — autoAnalyzePhotos fallback will NOT trigger')
    }
  } else if (data.photo_results) {
    console.log('  ✓ photo_results is populated — re-access should display photos correctly')
  }

  console.log('\nFull row (report_data truncated):')
  const display = { ...data }
  if (display.report_data) {
    const rd = { ...display.report_data }
    if (rd.descriptionRewrite) rd.descriptionRewrite = `[${rd.descriptionRewrite.length} chars]`
    display.report_data = rd
  }
  if (display.photo_previews) {
    display.photo_previews = `[${display.photo_previews.length} items]`
  }
  console.log(JSON.stringify(display, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
