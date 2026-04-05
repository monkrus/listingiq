const { execSync } = require('child_process')

function getAppVersion() {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
    return `1.0.${count}`
  } catch {
    return process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
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
