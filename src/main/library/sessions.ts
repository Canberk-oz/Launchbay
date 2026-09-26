// Play sessions seen by Launchbay's running-game watcher. Pure, so the
// accounting is unit-tested under plain Node.

/** Sessions shorter than this are noise (a crash on start, a launcher blip) and are not counted. */
export const MIN_SESSION_SECONDS = 30

export interface SessionChange {
  started: string[]
  /** Finished sessions long enough to count, in whole seconds. */
  ended: Array<{ id: string; seconds: number }>
}

/**
 * Pure: updates `starts` (game id → epoch ms the session began) for a new
 * running set, and reports which sessions began and which ended.
 */
export function trackSessions(starts: Map<string, number>, running: ReadonlySet<string>, now: number): SessionChange {
  const change: SessionChange = { started: [], ended: [] }
  for (const id of running) {
    if (starts.has(id)) continue
    starts.set(id, now)
    change.started.push(id)
  }
  for (const [id, since] of starts) {
    if (running.has(id)) continue
    starts.delete(id)
    const seconds = Math.round((now - since) / 1000)
    if (seconds >= MIN_SESSION_SECONDS) change.ended.push({ id, seconds })
  }
  return change
}
