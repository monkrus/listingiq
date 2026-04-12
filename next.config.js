const { version } = require('./package.json')
const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
}
module.exports = withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI/prod).
  // Silently skip in local dev.
  silent: true,
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
})
