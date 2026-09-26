import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Every script runs with UTF-8 stdout (no BOM) so non-ASCII names and paths
// survive, and without progress streams that would pollute stderr.
const PRELUDE = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)'
].join('\n')

// CreateProcess caps the command line at 32767 chars; base64 of UTF-16 costs
// ~2.7 chars per script char, so long scripts go through a temp file instead.
const MAX_INLINE_SCRIPT = 9000

function powershellExe(): string {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Quotes a value as a PowerShell single-quoted string literal. */
export function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function psStringArray(values: string[]): string {
  return values.length ? `@(${values.map(psString).join(', ')})` : '@()'
}

export interface PowerShellOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export class PowerShellError extends Error {
  readonly stderr: string
  readonly exitCode: number | null
  constructor(message: string, stderr: string, exitCode: number | null) {
    super(message)
    this.name = 'PowerShellError'
    this.stderr = stderr
    this.exitCode = exitCode
  }
}

/** Runs a Windows PowerShell script and resolves with its stdout. */
export async function runPowerShell(script: string, opts: PowerShellOptions = {}): Promise<string> {
  const full = `${PRELUDE}\n${script}`
  let tempFile: string | null = null
  let args: string[]
  if (full.length > MAX_INLINE_SCRIPT) {
    tempFile = join(tmpdir(), `launchbay-${process.pid}-${Date.now().toString(36)}.ps1`)
    // The BOM makes Windows PowerShell read the file as UTF-8.
    await fs.writeFile(tempFile, '\ufeff' + full, 'utf8')
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempFile]
  } else {
    const encoded = Buffer.from(full, 'utf16le').toString('base64')
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded]
  }

  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(powershellExe(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onAbort)
        fn()
      }
      const onAbort = (): void => {
        child.kill()
        finish(() => reject(new PowerShellError('PowerShell script aborted', '', null)))
      }
      const timer = setTimeout(() => {
        child.kill()
        finish(() => reject(new PowerShellError(`PowerShell timed out after ${opts.timeoutMs}ms`, '', null)))
      }, opts.timeoutMs ?? 30_000)

      if (opts.signal?.aborted) return onAbort()
      opts.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (d: Buffer) => out.push(d))
      child.stderr.on('data', (d: Buffer) => err.push(d))
      child.on('error', (e) => finish(() => reject(e)))
      child.on('close', (code) => {
        const stdout = Buffer.concat(out).toString('utf8').replace(/^\ufeff/, '')
        const stderr = Buffer.concat(err).toString('utf8')
        if (code === 0) finish(() => resolve(stdout))
        else finish(() => reject(new PowerShellError(`PowerShell exited with code ${code}`, stderr, code)))
      })
    })
  } finally {
    if (tempFile) await fs.rm(tempFile, { force: true }).catch(() => undefined)
  }
}

/** Runs a script that writes one JSON document to stdout and parses it. */
export async function runPowerShellJson<T>(script: string, opts?: PowerShellOptions): Promise<T> {
  const stdout = (await runPowerShell(script, opts)).trim()
  return JSON.parse(stdout || 'null') as T
}
