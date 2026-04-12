#!/usr/bin/env node
/**
 * Simple load test for ListingIQ.
 *
 * Hits the demo/mock endpoints to measure throughput and response times
 * without consuming real API credits.
 *
 * Usage:
 *   node scripts/load-test.mjs                          # default: 10 concurrent, 50 total
 *   node scripts/load-test.mjs --concurrent 20 --total 100
 *   node scripts/load-test.mjs --url https://listingiq.pro  # test production
 *
 * Requires USE_MOCK_API=true on the target server (or uses demo mode).
 */

const args = process.argv.slice(2)

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const BASE_URL = getArg('url', 'http://localhost:3000')
const CONCURRENT = parseInt(getArg('concurrent', '10'))
const TOTAL = parseInt(getArg('total', '50'))

const ENDPOINTS = [
  {
    name: 'GET /api/health',
    method: 'GET',
    path: '/api/health',
  },
  {
    name: 'POST /api/analyze (demo)',
    method: 'POST',
    path: '/api/analyze',
    body: JSON.stringify({
      isDemo: true,
      title: 'Load Test Listing',
      description: 'A test listing for load testing purposes.',
      amenities: ['WiFi', 'Kitchen', 'Parking'],
    }),
    headers: { 'Content-Type': 'application/json' },
  },
]

async function runRequest(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`
  const start = performance.now()
  try {
    const res = await fetch(url, {
      method: endpoint.method,
      headers: endpoint.headers || {},
      body: endpoint.body || undefined,
    })
    const duration = Math.round(performance.now() - start)
    return { status: res.status, duration, error: null }
  } catch (err) {
    const duration = Math.round(performance.now() - start)
    return { status: 0, duration, error: err.message }
  }
}

async function runBatch(endpoint, batchSize) {
  const promises = Array.from({ length: batchSize }, () => runRequest(endpoint))
  return Promise.all(promises)
}

function printStats(name, results) {
  const durations = results.map(r => r.duration).sort((a, b) => a - b)
  const successes = results.filter(r => r.status >= 200 && r.status < 400).length
  const failures = results.length - successes
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  const p50 = durations[Math.floor(durations.length * 0.5)]
  const p95 = durations[Math.floor(durations.length * 0.95)]
  const p99 = durations[Math.floor(durations.length * 0.99)]
  const min = durations[0]
  const max = durations[durations.length - 1]

  console.log(`\n  ${name}`)
  console.log(`  ${'─'.repeat(50)}`)
  console.log(`  Requests:  ${results.length} total, ${successes} ok, ${failures} failed`)
  console.log(`  Latency:   avg=${avg}ms  p50=${p50}ms  p95=${p95}ms  p99=${p99}ms`)
  console.log(`  Range:     min=${min}ms  max=${max}ms`)

  // Show error breakdown if any failures
  if (failures > 0) {
    const errorCounts = {}
    results.filter(r => r.status < 200 || r.status >= 400).forEach(r => {
      const key = r.error || `HTTP ${r.status}`
      errorCounts[key] = (errorCounts[key] || 0) + 1
    })
    console.log(`  Errors:`)
    for (const [err, count] of Object.entries(errorCounts)) {
      console.log(`    ${count}x ${err}`)
    }
  }
}

async function main() {
  console.log(`\nLoad Test: ${BASE_URL}`)
  console.log(`Concurrency: ${CONCURRENT}  |  Total per endpoint: ${TOTAL}\n`)

  for (const endpoint of ENDPOINTS) {
    const allResults = []
    let remaining = TOTAL

    const overallStart = performance.now()
    while (remaining > 0) {
      const batch = Math.min(remaining, CONCURRENT)
      const results = await runBatch(endpoint, batch)
      allResults.push(...results)
      remaining -= batch
    }
    const totalTime = Math.round(performance.now() - overallStart)
    const rps = (TOTAL / (totalTime / 1000)).toFixed(1)

    printStats(endpoint.name, allResults)
    console.log(`  Throughput: ${rps} req/s  (${totalTime}ms total)`)
  }

  console.log('\nDone.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
