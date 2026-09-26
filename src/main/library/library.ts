// The library: cached scan results merged with the user's own state
// (favorites, hidden, last played) and the media cache into `Game` records.

import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { Game, Platform, ScanStatus } from '@shared/types'
import { providerFor, providers } from '../providers'
import type { CoverSource, ScannedGame } from '../providers/types'
import { JsonStore } from '../util/fsutil'
import { createLogger } from '../util/log'
import type { MediaService } from './media'

const log = createLogger('library')

const SCAN_TIMEOUT_MS = 90_000

interface StoredGame extends ScannedGame {
  id: string
  lastScanned: number
}

interface LibraryCache {
  version: 1
  lastScanAt: number | null
  games: StoredGame[]
}

interface UserGameState {
  favorite?: boolean
  favoritedAt?: number
  lastPlayed?: number
  hidden?: boolean
}

interface UserData {
  version: 1
  games: Record<string, UserGameState>
}

function normalizeCache(raw: unknown): LibraryCache {
  const r = raw as Partial<LibraryCache> | null
  const games = Array.isArray(r?.games)
    ? r.games.filter((g): g is StoredGame => !!g && typeof g.id === 'string' && typeof g.platform === 'string')
    : []
  for (const g of games) if (!Array.isArray(g.coverSources)) g.coverSources = [] as CoverSource[]
  return { version: 1, lastScanAt: typeof r?.lastScanAt === 'number' ? r.lastScanAt : null, games }
}

function normalizeUserData(raw: unknown): UserData {
  const r = raw as Partial<UserData> | null
  return { version: 1, games: r?.games && typeof r.games === 'object' ? r.games : {} }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} scan timed out`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

export class LibraryService extends EventEmitter {
  private readonly cache: JsonStore<LibraryCache>
  private readonly user: JsonStore<UserData>
  private readonly media: MediaService
  private readonly games = new Map<string, StoredGame>()
  private scanning: Promise<void> | null = null
  private queued: { manual: boolean } | null = null

  constructor(root: string, media: MediaService) {
    super()
    this.cache = new JsonStore<LibraryCache>(join(root, 'library.json'), normalizeCache(null))
    this.user = new JsonStore<UserData>(join(root, 'userdata.json'), normalizeUserData(null))
    this.media = media
    media.on('changed', () => this.emit('changed'))
  }

  async init(): Promise<void> {
    await Promise.all([this.cache.load(normalizeCache), this.user.load(normalizeUserData)])
    for (const g of this.cache.data.games) this.games.set(g.id, g)
  }

  async flush(): Promise<void> {
    await Promise.all([this.cache.flush(), this.user.flush()])
  }

  list(): Game[] {
    return [...this.games.values()].map((g) => this.toGame(g))
  }

  get(id: string): Game | undefined {
    const stored = this.games.get(id)
    return stored ? this.toGame(stored) : undefined
  }

  scanStatus(): ScanStatus {
    return { scanning: this.scanning !== null, lastScanAt: this.cache.data.lastScanAt }
  }

  /**
   * Re-runs every provider. A manual refresh also retries cover and trailer
   * lookups that failed before. Calls during a scan queue one follow-up scan.
   */
  refresh(opts: { manual: boolean }): Promise<void> {
    if (this.scanning) {
      this.queued = { manual: opts.manual || (this.queued?.manual ?? false) }
      return this.scanning
    }
    this.scanning = this.runScan(opts.manual).finally(() => {
      this.scanning = null
      this.emit('scan-status', this.scanStatus())
      const next = this.queued
      this.queued = null
      if (next) void this.refresh(next)
    })
    this.emit('scan-status', this.scanStatus())
    return this.scanning
  }

  private async runScan(manual: boolean): Promise<void> {
    const started = Date.now()
    const results = await Promise.allSettled(
      providers.map((p) => withTimeout(p.scan(), SCAN_TIMEOUT_MS, p.label))
    )
    const now = Date.now()

    results.forEach((result, index) => {
      const platform: Platform = providers[index].platform
      if (result.status === 'rejected') {
        // Keep the last known games for this platform rather than dropping them.
        log.error(`${providers[index].label} scan failed`, result.reason)
        return
      }
      for (const [id, g] of this.games) if (g.platform === platform) this.games.delete(id)
      for (const scanned of result.value) {
        const id = `${scanned.platform}:${scanned.platformId}`
        this.games.set(id, { ...scanned, id, lastScanned: now })
      }
      log.info(`${providers[index].label}: ${result.value.length} game(s)`)
    })

    this.cache.data = { version: 1, lastScanAt: now, games: [...this.games.values()] }
    this.cache.save()
    log.info(`scan finished in ${Date.now() - started} ms (${this.games.size} games)`)
    this.emit('changed')

    const all = [...this.games.values()]
    void this.media.syncCovers(all, { retryFailed: manual })
    this.media.queueTrailerLookups(
      all.map((g) => this.toGame(g)),
      { retryFailed: manual }
    )
  }

  private userState(id: string): UserGameState {
    return (this.user.data.games[id] ??= {})
  }

  setFavorite(id: string, favorite: boolean): void {
    const state = this.userState(id)
    state.favorite = favorite
    if (favorite) state.favoritedAt = Date.now()
    else delete state.favoritedAt
    this.user.save()
    this.emit('changed')
  }

  setHidden(id: string, hidden: boolean): void {
    this.userState(id).hidden = hidden
    this.user.save()
    this.emit('changed')
  }

  markPlayed(id: string): void {
    this.userState(id).lastPlayed = Date.now()
    this.user.save()
    this.emit('changed')
  }

  private toGame(g: StoredGame): Game {
    const user = this.user.data.games[g.id] ?? {}
    const lastPlayed = Math.max(g.lastPlayed ?? 0, user.lastPlayed ?? 0) || null
    return {
      id: g.id,
      platform: g.platform,
      platformId: g.platformId,
      name: g.name,
      installPath: g.installPath,
      launchCommand: g.launchCommand,
      coverImageUrl: this.media.coverUrl(g.id),
      coverFrame: this.media.coverFrame(g.id),
      coverBackground: this.media.coverBackground(g.id),
      trailerUrl: this.media.trailerUrl(g.id),
      trailerState: providerFor(g.platform).resolveTrailer ? this.media.trailerState(g.id) : 'none',
      sizeOnDisk: g.sizeOnDisk,
      playtimeMinutes: g.playtimeMinutes,
      lastScanned: g.lastScanned,
      isFavorite: !!user.favorite,
      favoritedAt: user.favorite ? (user.favoritedAt ?? null) : null,
      lastPlayed,
      isHidden: !!user.hidden
    }
  }
}
