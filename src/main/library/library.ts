// The library: cached scan results merged with the user's own state
// (favorites, hidden, last played) and the media cache into `Game` records.

import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { cleanCollections, collectionsOf } from '@shared/collections'
import type { Game, LibraryPatch, Platform, ScanStatus, SizeStatus } from '@shared/types'
import { providerFor, providers } from '../providers'
import type { CoverSource, GameProvider, ScannedGame } from '../providers/types'
import { JsonStore } from '../util/fsutil'
import { createLogger } from '../util/log'
import { addedAtFrom } from './addedAt'
import type { MediaService } from './media'
import { SizeService } from './sizes'

const log = createLogger('library')

const SCAN_TIMEOUT_MS = 90_000

export interface StoredGame extends ScannedGame {
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
  /** Epoch ms the game arrived on this PC; cleared when a successful scan no longer finds it. */
  addedAt?: number
  /** Collections the game is in. Kept when the game is uninstalled, like favorites. */
  tags?: string[]
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

/** Whether a rescan found a game exactly as it was (ignoring when it was scanned). */
export function sameScan(before: StoredGame, after: ScannedGame): boolean {
  const { id: _id, lastScanned: _at, ...rest } = before
  return JSON.stringify(rest) === JSON.stringify(after)
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
  private readonly providers: readonly GameProvider[]
  private readonly sizes: SizeService
  private readonly games = new Map<string, StoredGame>()
  private scanning: Promise<void> | null = null
  private queued: { manual: boolean } | null = null
  // Changes not yet sent to the renderer; see drainChanges().
  private readonly dirty = new Set<string>()
  private readonly removed = new Set<string>()
  private seq = 0

  constructor(root: string, media: MediaService, stores: readonly GameProvider[] = providers, sizes = new SizeService(root)) {
    super()
    this.providers = stores
    this.sizes = sizes
    sizes.on('changed', (id: string) => {
      if (this.games.has(id)) this.touch(id)
    })
    this.cache = new JsonStore<LibraryCache>(join(root, 'library.json'), normalizeCache(null))
    this.user = new JsonStore<UserData>(join(root, 'userdata.json'), normalizeUserData(null))
    this.media = media
    media.on('changed', (id: string) => {
      if (this.games.has(id)) this.touch(id)
    })
  }

  /** Marks a game for the next patch and announces that one is due. */
  private touch(id: string): void {
    this.dirty.add(id)
    this.removed.delete(id)
    this.emit('changed')
  }

  /** The number of the last patch handed out; the initial state includes everything up to it. */
  patchSeq(): number {
    return this.seq
  }

  /** Takes the pending changes as one patch, or null when nothing changed. */
  drainChanges(): LibraryPatch | null {
    if (this.dirty.size === 0 && this.removed.size === 0) return null
    const upsert: Game[] = []
    for (const id of this.dirty) {
      const stored = this.games.get(id)
      if (stored) upsert.push(this.toGame(stored))
    }
    const patch = { seq: ++this.seq, upsert, remove: [...this.removed] }
    this.dirty.clear()
    this.removed.clear()
    return patch
  }

  async init(): Promise<void> {
    await Promise.all([this.cache.load(normalizeCache), this.user.load(normalizeUserData), this.sizes.init()])
    for (const g of this.cache.data.games) this.games.set(g.id, g)
  }

  async flush(): Promise<void> {
    await Promise.all([this.cache.flush(), this.user.flush(), this.sizes.flush()])
  }

  /** Stops background work (app quitting). */
  dispose(): void {
    this.sizes.dispose()
  }

  list(): Game[] {
    return [...this.games.values()].map((g) => this.toGame(g))
  }

  /** The scan record behind a game (provider fields the renderer never sees). */
  stored(id: string): StoredGame | undefined {
    return this.games.get(id)
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
      this.providers.map((p) => withTimeout(p.scan(), SCAN_TIMEOUT_MS, p.label))
    )
    const now = Date.now()
    const arrived: StoredGame[] = []

    results.forEach((result, index) => {
      const platform: Platform = this.providers[index].platform
      if (result.status === 'rejected') {
        // Keep the last known games for this platform rather than dropping them.
        log.error(`${this.providers[index].label} scan failed`, result.reason)
        return
      }
      const previous = new Map([...this.games].filter(([, g]) => g.platform === platform))
      for (const id of previous.keys()) this.games.delete(id)
      for (const scanned of result.value) {
        const id = `${scanned.platform}:${scanned.platformId}`
        const before = previous.get(id)
        previous.delete(id)
        const stored = { ...scanned, id, lastScanned: now }
        this.games.set(id, stored)
        if (this.user.data.games[id]?.addedAt === undefined) arrived.push(stored)
        if (!before || !sameScan(before, scanned)) this.touch(id)
      }
      // This platform was read successfully, so these games really are gone.
      for (const id of previous.keys()) {
        this.dirty.delete(id)
        this.removed.add(id)
        this.forgetAddedAt(id)
      }
      log.info(`${this.providers[index].label}: ${result.value.length} game(s)`)
    })

    await this.recordArrivals(arrived, now)

    this.cache.data = { version: 1, lastScanAt: now, games: [...this.games.values()] }
    this.cache.save()
    log.info(`scan finished in ${Date.now() - started} ms (${this.games.size} games)`)
    if (this.removed.size > 0) this.emit('changed')

    const all = [...this.games.values()]
    const keep = new Set(this.games.keys())
    void this.media.prune(keep).catch((err) => log.warn('media prune failed', err))
    this.sizes.prune(keep)
    this.sizes.sync(all, { retryFailed: manual })
    void this.media.syncCovers(all, { retryFailed: manual })
    this.media.queueTrailerLookups(
      all.map((g) => this.toGame(g)),
      { retryFailed: manual }
    )
  }

  /** Dates newly found games by their install folder's creation time (or now). */
  private async recordArrivals(games: StoredGame[], now: number): Promise<void> {
    if (games.length === 0) return
    await Promise.all(
      games.map(async (g) => {
        const created = await fs.stat(g.installPath).then((st) => st.birthtimeMs, () => null)
        this.userState(g.id).addedAt = addedAtFrom(created, now)
        this.touch(g.id)
      })
    )
    this.user.save()
  }

  private forgetAddedAt(id: string): void {
    const state = this.user.data.games[id]
    if (state?.addedAt === undefined) return
    delete state.addedAt
    if (Object.keys(state).length === 0) delete this.user.data.games[id]
    this.user.save()
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
    this.touch(id)
  }

  setHidden(id: string, hidden: boolean): void {
    this.userState(id).hidden = hidden
    this.user.save()
    this.touch(id)
  }

  /** Every collection in use, with its visible game count. */
  collections(): ReturnType<typeof collectionsOf> {
    return collectionsOf(this.list())
  }

  /** Replaces a game's collections; names matching an existing collection take its spelling. */
  setCollections(id: string, names: readonly string[]): void {
    const known = this.collections().map((c) => c.name)
    const tags = cleanCollections(names, known)
    const state = this.userState(id)
    if (tags.length) state.tags = tags
    else delete state.tags
    this.user.save()
    this.touch(id)
  }

  markPlayed(id: string): void {
    this.userState(id).lastPlayed = Date.now()
    this.user.save()
    this.touch(id)
  }

  private sizeOf(g: StoredGame): { sizeOnDisk: number | null; sizeStatus: SizeStatus } {
    if (g.sizeOnDisk !== null && g.sizeOnDisk > 0) return { sizeOnDisk: g.sizeOnDisk, sizeStatus: 'known' }
    const measured = this.sizes.lookup(g.id, g.sizeKey)
    switch (measured.status) {
      case 'ok':
        return { sizeOnDisk: measured.bytes, sizeStatus: 'known' }
      case 'none':
        return { sizeOnDisk: null, sizeStatus: g.sizeKey ? 'measuring' : 'unreported' }
      default:
        return { sizeOnDisk: null, sizeStatus: measured.status }
    }
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
      coverAmbient: this.media.coverAmbient(g.id),
      trailerUrl: this.media.trailerUrl(g.id),
      trailerState: providerFor(g.platform).resolveTrailer ? this.media.trailerState(g.id) : 'none',
      ...this.sizeOf(g),
      playtimeMinutes: g.playtimeMinutes,
      isFavorite: !!user.favorite,
      favoritedAt: user.favorite ? (user.favoritedAt ?? null) : null,
      lastPlayed,
      addedAt: user.addedAt ?? null,
      tags: Array.isArray(user.tags) ? user.tags.filter((t): t is string => typeof t === 'string') : [],
      // Caches written before this field existed have no value: unknown until the next scan.
      updateAvailable: g.updateAvailable ?? null,
      isHidden: !!user.hidden
    }
  }
}
