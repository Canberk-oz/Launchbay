import type { LaunchWatch } from './providers/types'
import { createLogger } from './util/log'
import { psString, psStringArray, runPowerShell } from './util/powershell'

const log = createLogger('launch')

/** How long to wait for a started game before handing the UI back anyway. */
export const LAUNCH_CONFIRM_TIMEOUT_MS = 9_000

/**
 * Polls (inside one PowerShell process) until a process runs from one of the
 * watched folders, or Steam reports the app as running. Resolves false on
 * timeout; a game that takes longer to start is still launching normally.
 */
export async function waitForGameStart(watch: LaunchWatch, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const dirs = watch.dirs
    .filter(Boolean)
    .map((d) => {
      const p = d.replace(/\//g, '\\').toLowerCase()
      return p.endsWith('\\') ? p : `${p}\\`
    })
  const script = `
$dirs = ${psStringArray(dirs)}
$appId = ${psString(watch.steamAppId ?? '')}
$deadline = [DateTime]::UtcNow.AddMilliseconds(${Math.round(timeoutMs)})
while ([DateTime]::UtcNow -lt $deadline) {
  if ($appId) {
    $running = (Get-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\\Software\\Valve\\Steam' -Name RunningAppID -ErrorAction SilentlyContinue).RunningAppID
    if ([string]$running -eq $appId) { [Console]::Out.Write('RUNNING'); exit 0 }
  }
  if ($dirs.Count -gt 0) {
    # A WQL SELECT fills ExecutablePath; Get-CimInstance -Property leaves it empty.
    foreach ($p in (Get-CimInstance -Query 'SELECT ExecutablePath FROM Win32_Process' -ErrorAction SilentlyContinue)) {
      $exe = $p.ExecutablePath
      if (-not $exe) { continue }
      $lower = $exe.ToLowerInvariant()
      foreach ($d in $dirs) { if ($lower.StartsWith($d)) { [Console]::Out.Write('RUNNING'); exit 0 } }
    }
  }
  Start-Sleep -Milliseconds 600
}
[Console]::Out.Write('TIMEOUT')
`
  try {
    return (await runPowerShell(script, { timeoutMs: timeoutMs + 8_000, signal })).trim() === 'RUNNING'
  } catch (err) {
    log.warn('launch watcher failed', err)
    return false
  }
}
