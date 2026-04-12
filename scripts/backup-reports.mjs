#!/usr/bin/env node
/**
 * Backup cached_reports from Supabase to a local JSON file.
 *
 * Run manually or on a schedule (e.g. weekly cron):
 *   node scripts/backup-reports.mjs
 *
 * Outputs: backups/cached-reports-YYYY-MM-DD.json
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  console.log('Fetching cached_reports...')

  const { data, error } = await db
    .from('cached_reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  console.log(`Found ${data.length} reports`)

  // Strip photo_previews to keep backup file small (base64 images are huge)
  const lightweight = data.map(row => ({
    ...row,
    photo_previews: row.photo_previews ? `[${row.photo_previews.length} items]` : null,
  }))

  // Write to backups/ directory
  const backupDir = path.resolve(process.cwd(), 'backups')
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)

  const date = new Date().toISOString().slice(0, 10)
  const outPath = path.join(backupDir, `cached-reports-${date}.json`)
  fs.writeFileSync(outPath, JSON.stringify(lightweight, null, 2))

  console.log(`Backup saved: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)
}

main().catch(err => { console.error(err); process.exit(1) })
