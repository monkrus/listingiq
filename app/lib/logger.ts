/**
 * Structured logger for production debugging.
 * Outputs JSON lines that are easily parseable by Railway/log aggregators.
 */

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  platform: string
  event: string
  timestamp: string
  [key: string]: unknown
}

function log(level: LogLevel, platform: string, event: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    platform,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }

  const line = JSON.stringify(entry)

  switch (level) {
    case 'error':
      console.error(line)
      break
    case 'warn':
      console.warn(line)
      break
    default:
      console.log(line)
  }
}

export const logger = {
  info: (platform: string, event: string, data?: Record<string, unknown>) =>
    log('info', platform, event, data),
  warn: (platform: string, event: string, data?: Record<string, unknown>) =>
    log('warn', platform, event, data),
  error: (platform: string, event: string, data?: Record<string, unknown>) =>
    log('error', platform, event, data),
}
