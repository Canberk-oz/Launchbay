// Which games are running right now. One long-lived PowerShell child polls
// WMI for running executables (plus Steam's RunningAppID) and writes a JSON
// line per poll; the snapshot is matched against every game's LaunchWatch.
//
// The child runs only while something asks for it (a "demand"):
//   launch  — a launch is being confirmed           (polls every second)
//   late    — a slow start is watched for afterwards (every 2 s, 3 minutes)
//   visible — the Launchbay window is on screen     (every 2 s)
//   session — a game it saw start is still running  (every 5 s, so tracked
//             playtime can see the game exit even with Launchbay hidden)
// With no demand the child is torn down and nothing polls.

import { EventEmitter } from 'node:events'
import { matchRunning, parseSnapshotLine, type WatchTarget } from './launchWatch'
import { createLogger } from './util/log'
import { startPowerShell, type PowerShellProcess } from './util/powershell'

const log = createLogger('running')

export type Demand = 'launch' | 'late' | 'visible' | 'session'

export const POLL_MS: Record<Demand, number> = { launch: 1000, late: 2000, visible: 2000, session: 5000 }

const MAX_RESTART_DELAY_MS = 30_000

/** Starts the polling child; replaced in tests. */
export type Spawner = (
  intervalMs: number,
  onLine: (line: string) => void,
  onExit: (code: number | null, stderr: string) => void
) => PowerShellProcess

const script = (intervalMs: number): string => `
$root = $env:SystemRoot
$last = ''
while ($true) {
  $exe = New-Object System.Collections.Generic.HashSet[string]
  # A WQL SELECT fills ExecutablePath; Get-CimInstance -Property leaves it empty.
  foreach ($p in (Get-CimInstance -Query 'SELECT ExecutablePath FROM Win32_Process' -ErrorAction SilentlyContinue)) {
    $path = $p.ExecutablePath
    if ($path -and -not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { [void]$exe.Add($path) }
  }
  $steam = [string](Get-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\\Software\\Valve\\Steam' -Name RunningAppID -ErrorAction SilentlyContinue).RunningAppID
  $line = ConvertTo-Json -Compress -InputObject @{ exe = @($exe); steam = $steam }
  if ($line -eq $last) { [Console]::Out.WriteLine('{"same":true}') } else { [Console]::Out.WriteLine($line); $last = $line }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${Math.round(intervalMs)}
}
`

const powershellSpawner: Spawner = (intervalMs, onLine, onExit) => startPowerShell(script(intervalMs), onLine, onExit)

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x))

/**
 * Emits 'running' (a Set of game ids) whenever the running games change. The
 * set is empty while nothing is watching: running state is then unknown, and
 * a game that was running keeps a 'session' demand, so that only happens once
 * it has exited.
 */
export class ProcessWatcher extends EventEmitter {
  private readonly targets: () => readonly WatchTarget[]
  private readonly spawn: Spawner
  private readonly demands = new Map<string, Demand>()
  private child: PowerShellProcess | null = null
  private interval = 0
  private current: ReadonlySet<string> = new Set()
  private restartTimer: NodeJS.Timeout | null = null
  private failures = 0
  private seq = 0
  private disposed = false

  constructor(targets: () => readonly WatchTarget[], spawn: Spawner = powershellSpawner) {
    super()
    this.targets = targets
    this.spawn = spawn
  }

  running(): ReadonlySet<string> {
    return this.current
  }

  /** Polling interval in effect, 0 when stopped (tests and diagnostics). */
  pollInterval(): number {
    return this.child ? this.interval : 0
  }

  demand(key: string, kind: Demand): void {
    if (this.disposed || this.demands.get(key) === kind) return
    this.demands.set(key, kind)
    this.reconcile()
  }

  release(key: string): void {
    if (this.demands.delete(key)) this.reconcile()
  }

  /**
   * Resolves true once the game shows up as running, false after `timeoutMs`
   * or when `signal` aborts. Polls at the `rate` demand's pace meanwhile.
   */
  waitFor(id: string, timeoutMs: number, signal?: AbortSignal, rate: Demand = 'launch'): Promise<boolean> {
    if (this.current.has(id)) return Promise.resolve(true)
    const key = `wait:${id}:${++this.seq}`
    return new Promise<boolean>((resolve) => {
      const finish = (value: boolean): void => {
        clearTimeout(timer)
        this.off('running', onRunning)
        signal?.removeEventListener('abort', onAbort)
        this.release(key)
        resolve(value)
      }
      const onRunning = (ids: ReadonlySet<string>): void => {
        if (ids.has(id)) finish(true)
      }
      const onAbort = (): void => finish(false)
      const timer = setTimeout(() => finish(false), timeoutMs)
      this.on('running', onRunning)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.demand(key, rate)
      if (signal?.aborted) onAbort()
    })
  }

  dispose(): void {
    this.disposed = true
    this.demands.clear()
    this.reconcile()
  }

  private reconcile(): void {
    const want = this.demands.size ? Math.min(...[...this.demands.values()].map((d) => POLL_MS[d])) : 0
    if (want === this.interval && (want === 0 || this.child || this.restartTimer)) return
    this.stopChild()
    this.interval = want
    if (want === 0) {
      this.failures = 0
      this.setRunning(new Set())
      return
    }
    this.startChild()
  }

  private startChild(): void {
    const handle = this.spawn(
      this.interval,
      (line) => this.onLine(line),
      (code, stderr) => {
        if (this.child !== handle) return
        this.child = null
        const delay = Math.min(MAX_RESTART_DELAY_MS, 1000 * 2 ** this.failures++)
        log.warn(`watcher exited (code ${code}); restarting in ${delay} ms`, stderr.trim().slice(0, 300))
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null
          if (this.interval && !this.child) this.startChild()
        }, delay)
      }
    )
    this.child = handle
  }

  private stopChild(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const child = this.child
    this.child = null
    child?.stop()
  }

  private onLine(line: string): void {
    const parsed = parseSnapshotLine(line)
    if (!parsed || parsed === 'same') return
    this.failures = 0
    this.setRunning(matchRunning(parsed, this.targets()))
  }

  private setRunning(next: ReadonlySet<string>): void {
    if (sameSet(next, this.current)) return
    const previous = this.current
    this.current = next
    // A game seen running keeps a slow watch alive until it exits (tracked playtime).
    for (const id of next) if (!previous.has(id)) this.demands.set(`session:${id}`, 'session')
    for (const id of previous) if (!next.has(id)) this.demands.delete(`session:${id}`)
    this.emit('running', next)
    this.reconcile()
  }
}
