import { appendFileSync, mkdirSync, renameSync, statSync, truncateSync } from 'node:fs'
import { dirname } from 'node:path'

let logFile: string | null = null

/**
 * Starts mirroring log lines to a file. Past 1 MB the file becomes
 * `<name>.old` (replacing the previous one) and a fresh one starts, so the
 * run that led up to a problem is still there to read.
 */
export function initLogFile(file: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    try {
      if (statSync(file).size > 1024 * 1024) {
        try {
          renameSync(file, `${file}.old`)
        } catch {
          truncateSync(file, 0) // the old copy is locked; at least stop growing
        }
      }
    } catch {
      // file does not exist yet
    }
    logFile = file
  } catch {
    logFile = null
  }
}

function write(level: string, scope: string, args: unknown[]): void {
  const parts = args.map((a) =>
    a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : safeJson(a)
  )
  const line = `${new Date().toISOString()} ${level} [${scope}] ${parts.join(' ')}`
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
  if (logFile) {
    try {
      appendFileSync(logFile, line + '\n')
    } catch {
      // logging must never throw
    }
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export function createLogger(scope: string): Logger {
  return {
    info: (...args) => write('INFO', scope, args),
    warn: (...args) => write('WARN', scope, args),
    error: (...args) => write('ERROR', scope, args)
  }
}
