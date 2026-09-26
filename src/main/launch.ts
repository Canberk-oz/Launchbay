import type { LaunchResult } from '@shared/types'
import type { LibraryService } from './library/library'
import { providerFor } from './providers'
import { sleep } from './util/concurrency'
import { createLogger } from './util/log'
import { LAUNCH_CONFIRM_TIMEOUT_MS, waitForGameStart } from './launchWatch'

const log = createLogger('launch')

export class LaunchService {
  private readonly library: LibraryService
  private readonly inFlight = new Map<string, Promise<LaunchResult>>()
  /** LAUNCHBAY_DRY_RUN=1 simulates launches (=fail simulates a failure); for development. */
  private readonly dryRun = process.env.LAUNCHBAY_DRY_RUN ?? ''
  private readonly abort = new AbortController()

  constructor(library: LibraryService) {
    this.library = library
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

    const watch = provider.launchWatch?.(game)
    if (!watch) return { ok: true, confirmed: false }
    const confirmed = await waitForGameStart(watch, LAUNCH_CONFIRM_TIMEOUT_MS, this.abort.signal)
    log.info(`${game.id}: ${confirmed ? 'running' : 'not detected before timeout'}`)
    return { ok: true, confirmed }
  }
}
