// Recognising running games. A snapshot of running executables (and Steam's
// RunningAppID) is matched against each game's LaunchWatch: a process whose
// image lies under the game's folder means the game is running. Pure, so it
// is unit-tested under plain Node; ProcessWatcher (processWatch.ts) supplies
// the snapshots.

import type { LaunchWatch } from './providers/types'

/** How long the launch screen waits for a started game before handing the UI back. */
export const LAUNCH_CONFIRM_TIMEOUT_MS = 9_000
/** How long detection carries on in the background after that, for slow starts. */
export const LATE_START_WATCH_MS = 180_000

export interface ProcessSnapshot {
  /** Full paths of running executables. */
  exe: string[]
  /** HKCU\Software\Valve\Steam\RunningAppID, or '' / '0' when none. */
  steamAppId: string
}

export interface WatchTarget {
  id: string
  watch: LaunchWatch
}

/** A folder as a lower-case prefix with one trailing backslash, so C:\Game never matches C:\GameTwo. */
export function folderPrefix(dir: string): string {
  const p = dir.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')
  return `${p}\\`
}

/** Pure: the ids of the targets that are running in this snapshot. */
export function matchRunning(snapshot: ProcessSnapshot, targets: readonly WatchTarget[]): Set<string> {
  const exes = snapshot.exe.map((e) => e.replace(/\//g, '\\').toLowerCase())
  const steamApp = snapshot.steamAppId && snapshot.steamAppId !== '0' ? snapshot.steamAppId : ''
  const running = new Set<string>()
  for (const { id, watch } of targets) {
    if (steamApp && watch.steamAppId === steamApp) {
      running.add(id)
      continue
    }
    const prefixes = watch.dirs.filter((d) => d.trim().length > 3).map(folderPrefix)
    if (prefixes.some((prefix) => exes.some((exe) => exe.startsWith(prefix)))) running.add(id)
  }
  return running
}

/** Pure: parses one line from the watcher script; null for a heartbeat or noise. */
export function parseSnapshotLine(line: string): ProcessSnapshot | 'same' | null {
  let msg: unknown
  try {
    msg = JSON.parse(line)
  } catch {
    return null
  }
  if (!msg || typeof msg !== 'object') return null
  const m = msg as { same?: unknown; exe?: unknown; steam?: unknown }
  if (m.same === true) return 'same'
  const exe = Array.isArray(m.exe) ? m.exe.filter((e): e is string => typeof e === 'string') : typeof m.exe === 'string' ? [m.exe] : []
  return { exe, steamAppId: typeof m.steam === 'string' || typeof m.steam === 'number' ? String(m.steam) : '' }
}
