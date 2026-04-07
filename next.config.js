const { execSync } = require('child_process')

function getAppVersion() {
  // Try git commit count first (works locally)
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim()
    return `1.0.${count}`
  } catch {}
  // Railway: use commit SHA (always available as build arg)
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7)
  if (sha) return `1.0.${sha}`
  return '1.0.0'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
}
module.exports = nextConfig
