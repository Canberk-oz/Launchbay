import { EventEmitter } from 'node:events'
import type { LaunchResult } from '@shared/types'
import type { LibraryService } from './library/library'
import { LATE_START_WATCH_MS, LAUNCH_CONFIRM_TIMEOUT_MS } from './launchWatch'
import type { ProcessWatcher } from './processWatch'
import { providerFor } from './providers'
import { sleep } from './util/concurrency'
import { createLogger } from './util/log'

const log = createLogger('launch')

/**
 * Hands games to their launchers and confirms that they started. The launch
 * screen waits LAUNCH_CONFIRM_TIMEOUT_MS; a game that is slower than that
 * (a first Game Pass start, shader compilation) is watched for in the
 * background for a few more minutes, and 'late-start' is emitted (with the
 * game id) if it shows up, so it still gets its Running badge and the
 * "hide once running" setting still applies.
 */
export class LaunchService extends EventEmitter {
  private readonly library: LibraryService
  private readonly watcher: ProcessWatcher
  private readonly inFlight = new Map<string, Promise<LaunchResult>>()
  private readonly late = new Map<string, AbortController>()
  /** LAUNCHBAY_DRY_RUN=1 simulates launches (=fail simulates a failure); for development. */
  private readonly dryRun = process.env.LAUNCHBAY_DRY_RUN ?? ''
  private readonly abort = new AbortController()

  constructor(library: LibraryService, watcher: ProcessWatcher) {
    super()
    this.library = library
    this.watcher = watcher
  }

  launch(id: string): Promise<LaunchResult> {
    const existing = this.inFlight.get(id)
    if (existing) return existing
    const job = this.run(id).finally(() => this.inFlight.delete(id))
    this.inFlight.set(id, job)
    return job
  }

  /** Stops any launch watchers (app is quitting). */
  dispose(): void {
    this.abort.abort()
    for (const c of this.late.values()) c.abort()
  }

  private async run(id: string): Promise<LaunchResult> {
    const game = this.library.get(id)
    if (!game) return { ok: false, error: 'This game is no longer in your library. Try refreshing.' }

    if (this.dryRun) {
      log.info(`[dry run] ${game.launchCommand}`)
      await sleep(2200)
      if (this.dryRun === 'fail') return { ok: false, error: 'Simulated launch failure (LAUNCHBAY_DRY_RUN=fail).' }
      this.library.markPlayed(id)
      return { ok: true, confirmed: true }
    }

    const provider = providerFor(game.platform)
    try {
      log.info(`launching ${game.id} via ${game.launchCommand}`)
      await provider.launch(game)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn(`launch of ${game.id} failed: ${message}`)
      return { ok: false, error: message }
    }
    this.library.markPlayed(id)

    if (!provider.launchWatch) return { ok: true, confirmed: false }
    this.late.get(id)?.abort() // a relaunch replaces an older background watch
    const confirmed = await this.watcher.waitFor(id, LAUNCH_CONFIRM_TIMEOUT_MS, this.abort.signal)
    log.info(`${game.id}: ${confirmed ? 'running' : 'not detected yet; watching in the background'}`)
    if (!confirmed && !this.abort.signal.aborted) void this.watchLateStart(id)
    return { ok: true, confirmed }
  }

  private async watchLateStart(id: string): Promise<void> {
    const controller = new AbortController()
    this.late.set(id, controller)
    const started = await this.watcher.waitFor(id, LATE_START_WATCH_MS, AbortSignal.any([controller.signal, this.abort.signal]), 'late')
    if (this.late.get(id) === controller) this.late.delete(id)
    if (!started) {
      if (!controller.signal.aborted) log.info(`${id}: still not detected after the background watch`)
      return
    }
    log.info(`${id}: started late`)
    this.emit('late-start', id)
  }
}
