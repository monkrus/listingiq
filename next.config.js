const { execSync } = require('child_process')

function getCommitCount() {
  try {
    // Vercel does shallow clones — unshallow first to get full history
    execSync('git fetch --unshallow 2>/dev/null || true', { encoding: 'utf8', stdio: 'pipe' })
  } catch {}
  return execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim()
}

function getAppVersion() {
  try {
    const count = getCommitCount()
    if (count && count !== '1') return `1.0.${count}`
    // Shallow clone fallback: count was 1 but we have a sha, use it
    const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
    if (sha) return `1.0.${count}-${sha}`
    return `1.0.${count}`
  } catch {
    // No git at all — use Vercel sha if available
    const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
    return sha ? `1.0.0-${sha}` : (process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0')
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
}
module.exports = nextConfig
