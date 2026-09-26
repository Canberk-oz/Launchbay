// Cover art and trailer cache, served to the renderer over the glmedia://
// protocol. Covers are fetched right after a scan; trailers are looked up in a
// slow background queue (Steam rate-limits its store API) and only downloaded
// when a hover actually starts a preview.

import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { CoverFrame, Game, MediaCacheInfo, TrailerState } from '@shared/types'
import type { CoverSource, GameProvider } from '../providers/types'
import { directorySize, JsonStore, pathExists, writeFileAtomic } from '../util/fsutil'
import { HttpError, httpGet, httpGetBuffer, httpGetText, isTransientError } from '../util/http'
import { createLimiter, sleep } from '../util/concurrency'
import { createLogger } from '../util/log'
import { analyzeArtwork, type Artwork } from './artwork'
import { pickArtwork } from './framing'
import { planDashPreview, rebaseFragments } from './dash'

const log = createLogger('media')

export const MEDIA_SCHEME = 'glmedia'

type CoverRecord =
  | {
      status: 'ok'
      file: string
      source: string
      updatedAt: number
      /** Missing on records from before framing existed; those are re-analyzed on the next sync. */
      frame?: CoverFrame
      background?: string
    }
  | { status: 'failed'; error: string; updatedAt: number }

type TrailerRecord =
  | { status: 'available'; kind: 'dash' | 'progressive'; url: string; checkedAt: number; file?: string }
  | { status: 'none'; checkedAt: number }
  | { status: 'failed'; error: string; checkedAt: number }

interface MediaState {
  version: 1
  covers: Record<string, CoverRecord>
  trailers: Record<string, TrailerRecord>
}

export interface CoverJob {
  id: string
  coverSources: CoverSource[]
}

const TRAILER_CACHE_LIMIT_BYTES = 768 * 1024 * 1024
const PROGRESSIVE_MAX_BYTES = 80 * 1024 * 1024
// Steam's store API allows roughly 200 requests per 5 minutes.
const LOOKUP_SPACING_MS = 1600
const RATE_LIMIT_BACKOFF_MS = 60_000
const PREVIEW_SECONDS = 30
const PREVIEW_TARGET_HEIGHT = 480
// Trailers usually open on publisher and studio logos; start previews past them.
const PREVIEW_SKIP_SECONDS = 6

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function fileBase(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)
  return `${readable}-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`
}

function normalizeState(raw: unknown): MediaState {
  const r = raw as Partial<MediaState> | null
  return {
    version: 1,
    covers: r?.covers && typeof r.covers === 'object' ? r.covers : {},
    trailers: r?.trailers && typeof r.trailers === 'object' ? r.trailers : {}
  }
}

export class MediaService extends EventEmitter {
  private readonly store: JsonStore<MediaState>
  private readonly coversDir: string
  private readonly trailersDir: string
  private readonly providerOf: (game: Game) => GameProvider
  private readonly coverLimit = createLimiter(6)
  private readonly segmentLimit = createLimiter(4)
  private readonly coverJobs = new Map<string, Promise<void>>()
  private readonly lookups = new Map<string, Promise<TrailerRecord>>()
  private readonly previews = new Map<string, Promise<string | null>>()
  private readonly lookupQueue: Game[] = []
  private lookupRunning = false

  constructor(root: string, providerOf: (game: Game) => GameProvider) {
    super()
    this.coversDir = join(root, 'covers')
    this.trailersDir = join(root, 'trailers')
    this.store = new JsonStore<MediaState>(join(root, 'media.json'), normalizeState(null))
    this.providerOf = providerOf
  }

  private get state(): MediaState {
    return this.store.data
  }

  async init(): Promise<void> {
    await this.store.load(normalizeState)
    await fs.mkdir(this.coversDir, { recursive: true })
    await fs.mkdir(this.trailersDir, { recursive: true })
  }

  flush(): Promise<void> {
    return this.store.flush()
  }

  private changed(): void {
    this.store.save()
    this.emit('changed')
  }

  // ---------------------------------------------------------------- covers

  coverUrl(id: string): string | null {
    const record = this.state.covers[id]
    return record?.status === 'ok' ? `${MEDIA_SCHEME}://covers/${record.file}?v=${record.updatedAt}` : null
  }

  /**
   * Makes sure every game has a cached cover. Games whose earlier attempt
   * failed are skipped unless `retryFailed` (a manual refresh) is set.
   */
  async syncCovers(games: CoverJob[], opts: { retryFailed: boolean }): Promise<void> {
    await Promise.all(
      games.map(async (game) => {
        if (this.coverJobs.has(game.id)) return
        const record = this.state.covers[game.id]
        let work = (): Promise<void> => this.fetchCover(game)
        if (record?.status === 'ok' && (await pathExists(join(this.coversDir, record.file)))) {
          if (record.frame) return
          // Cached before covers were framed. Downloaded art only needs its
          // pixels re-read; local picks (package logos) are chosen again.
          work = /^https?:/i.test(record.source)
            ? () => this.reframeCover(game.id, record)
            : async () => {
                await this.fetchCover(game)
                if (this.state.covers[game.id]?.status === 'ok') return
                this.state.covers[game.id] = record // keep the old cover rather than none
                await this.reframeCover(game.id, record)
              }
        }
        if (record?.status === 'failed' && !opts.retryFailed) return
        const job = this.coverLimit(work)
          .catch((err) => log.warn(`cover job for ${game.id} crashed`, err))
          .finally(() => this.coverJobs.delete(game.id))
        this.coverJobs.set(game.id, job)
      })
    )
  }

  coverFrame(id: string): CoverFrame {
    const record = this.state.covers[id]
    return record?.status === 'ok' ? (record.frame ?? 'art') : 'art'
  }

  coverBackground(id: string): string | null {
    const record = this.state.covers[id]
    return record?.status === 'ok' ? (record.background ?? null) : null
  }

  private async reframeCover(id: string, record: Extract<CoverRecord, { status: 'ok' }>): Promise<void> {
    const art = analyzeArtwork(await fs.readFile(join(this.coversDir, record.file)))
    if (art) await this.saveCover(id, art, record.source)
  }

  /**
   * Tries the sources in order. A run of consecutive local files (package
   * logos, Steam's own cache) is compared as a group and `pickArtwork` chooses
   * one, by the provider's tiers and how much artwork each image shows.
   */
  private async fetchCover(game: CoverJob): Promise<void> {
    let lastError = 'no cover source'
    const sources = game.coverSources
    for (let i = 0; i < sources.length; ) {
      const source = sources[i]
      let art: Artwork | null = null
      let origin = ''
      if (source.kind === 'url') {
        i++
        try {
          art = analyzeArtwork((await httpGetBuffer(source.url, { timeoutMs: 20_000 })).data)
          origin = source.url
          if (!art) lastError = 'not an image'
        } catch (err) {
          lastError = errorMessage(err)
        }
      } else {
        const found: Array<{ art: Artwork; path: string; tier: number; background?: string }> = []
        while (i < sources.length) {
          const next = sources[i]
          if (next.kind !== 'file') break
          i++
          try {
            const candidate = analyzeArtwork(await fs.readFile(next.path))
            if (candidate) found.push({ art: candidate, path: next.path, tier: next.tier ?? 0, background: next.background })
          } catch (err) {
            lastError = errorMessage(err)
          }
        }
        const best = found[pickArtwork(found.map((f) => ({ tier: f.tier, frame: f.art.frame, content: f.art.content })))]
        if (best) {
          art = best.art
          origin = best.path
          // A transparent mark takes the color its package declares for it.
          if (art.frame === 'mark' && !art.background && best.background) art = { ...art, background: best.background }
        }
      }
      if (art && art.data.length >= 256) {
        await this.saveCover(game.id, art, origin)
        return
      }
    }
    this.state.covers[game.id] = { status: 'failed', error: lastError, updatedAt: Date.now() }
    this.changed()
  }

  private async saveCover(id: string, art: Artwork, origin: string): Promise<void> {
    const file = `${fileBase(id)}.${art.ext}`
    await writeFileAtomic(join(this.coversDir, file), art.data)
    const previous = this.state.covers[id]
    if (previous?.status === 'ok' && previous.file !== file) {
      await fs.rm(join(this.coversDir, previous.file), { force: true })
    }
    this.state.covers[id] = {
      status: 'ok',
      file,
      source: origin,
      updatedAt: Date.now(),
      frame: art.frame,
      ...(art.background ? { background: art.background } : {})
    }
    this.changed()
  }

  // -------------------------------------------------------------- trailers

  trailerState(id: string): TrailerState {
    const record = this.state.trailers[id]
    if (!record) return 'unknown'
    return record.status === 'available' ? 'available' : 'none'
  }

  trailerUrl(id: string): string | null {
    const record = this.state.trailers[id]
    return record?.status === 'available' ? record.url : null
  }

  /** Queues store-API lookups for games that have never been checked (plus failures on a manual refresh). */
  queueTrailerLookups(games: Game[], opts: { retryFailed: boolean }): void {
    for (const game of games) {
      if (!this.providerOf(game).resolveTrailer) continue
      const record = this.state.trailers[game.id]
      const due = !record || (opts.retryFailed && record.status === 'failed')
      if (due && !this.lookupQueue.some((g) => g.id === game.id)) this.lookupQueue.push(game)
    }
    void this.drainLookupQueue()
  }

  private async drainLookupQueue(): Promise<void> {
    if (this.lookupRunning) return
    this.lookupRunning = true
    try {
      while (this.lookupQueue.length > 0) {
        const game = this.lookupQueue.shift()!
        const status = this.state.trailers[game.id]?.status
        if (status === 'available' || status === 'none') continue // resolved on demand meanwhile
        try {
          await this.lookupTrailer(game)
        } catch (err) {
          if (err instanceof HttpError && err.status === 429) {
            log.warn('Steam store API rate limit hit; pausing trailer lookups')
            this.lookupQueue.unshift(game)
            await sleep(RATE_LIMIT_BACKOFF_MS)
            continue
          }
        }
        await sleep(LOOKUP_SPACING_MS)
      }
    } finally {
      this.lookupRunning = false
    }
  }

  /** Resolves one trailer through the provider; 429s are rethrown for the queue to back off. */
  private lookupTrailer(game: Game): Promise<TrailerRecord> {
    const existing = this.lookups.get(game.id)
    if (existing) return existing
    const provider = this.providerOf(game)
    const job = (async (): Promise<TrailerRecord> => {
      let record: TrailerRecord
      try {
        const info = await provider.resolveTrailer!(game)
        record = info
          ? { status: 'available', kind: info.kind, url: info.url, checkedAt: Date.now() }
          : { status: 'none', checkedAt: Date.now() }
      } catch (err) {
        if (err instanceof HttpError && err.status === 429) throw err
        record = { status: 'failed', error: errorMessage(err), checkedAt: Date.now() }
      }
      this.state.trailers[game.id] = record
      this.changed()
      return record
    })().finally(() => this.lookups.delete(game.id))
    this.lookups.set(game.id, job)
    return job
  }

  /**
   * Called when a hover preview starts. Returns a playable source: the cached
   * file when there is one, otherwise it builds (DASH) or streams (progressive)
   * the trailer and caches it for the next hover.
   */
  async getTrailerSource(game: Game): Promise<{ src: string } | null> {
    if (!this.providerOf(game).resolveTrailer) return null
    let record = this.state.trailers[game.id]
    if (!record) {
      try {
        record = await this.lookupTrailer(game)
      } catch {
        return null // rate limited right now; the background queue will retry
      }
    }
    if (record.status !== 'available') return null

    if (record.file && (await pathExists(join(this.trailersDir, record.file)))) {
      void this.touch(record.file)
      return { src: `${MEDIA_SCHEME}://trailers/${record.file}` }
    }
    if (record.kind === 'progressive') {
      this.cacheProgressive(game.id, record.url)
      return { src: record.url }
    }
    const file = await this.buildDashPreview(game.id, record.url)
    return file ? { src: `${MEDIA_SCHEME}://trailers/${file}` } : null
  }

  private buildDashPreview(id: string, manifestUrl: string): Promise<string | null> {
    const existing = this.previews.get(id)
    if (existing) return existing
    const job = (async (): Promise<string | null> => {
      const manifest = await httpGetText(manifestUrl, { timeoutMs: 15_000 })
      const plan = planDashPreview(manifest, manifestUrl, {
        targetHeight: PREVIEW_TARGET_HEIGHT,
        maxSeconds: PREVIEW_SECONDS,
        skipSeconds: PREVIEW_SKIP_SECONDS
      })
      if (!plan || plan.segmentUrls.length === 0) throw new Error('manifest has no playable video track')
      const parts = await Promise.all(
        [plan.initUrl, ...plan.segmentUrls].map((url) =>
          this.segmentLimit(async () => (await httpGetBuffer(url, { timeoutMs: 20_000 })).data)
        )
      )
      if (parts[0].length < 8 || parts[0].toString('ascii', 4, 8) !== 'ftyp') {
        throw new Error('initialization segment is not an MP4')
      }
      const file = `${fileBase(id)}.mp4`
      await writeFileAtomic(join(this.trailersDir, file), Buffer.concat([parts[0], ...rebaseFragments(parts.slice(1))]))
      this.attachTrailerFile(id, file)
      void this.enforceTrailerLimit(file)
      return file
    })()
      .catch((err) => {
        log.warn(`trailer preview for ${id} failed:`, errorMessage(err))
        if (!isTransientError(err)) {
          this.state.trailers[id] = { status: 'failed', error: errorMessage(err), checkedAt: Date.now() }
          this.changed()
        }
        return null
      })
      .finally(() => this.previews.delete(id))
    this.previews.set(id, job)
    return job
  }

  private cacheProgressive(id: string, url: string): void {
    if (this.previews.has(id)) return
    const job = (async (): Promise<string | null> => {
      const res = await httpGet(url, { timeoutMs: 180_000 })
      if (Number(res.headers.get('content-length') ?? 0) > PROGRESSIVE_MAX_BYTES) {
        await res.body?.cancel()
        return null
      }
      const data = Buffer.from(await res.arrayBuffer())
      if (data.length > PROGRESSIVE_MAX_BYTES) return null
      const ext = url.split('?')[0].toLowerCase().endsWith('.webm') ? 'webm' : 'mp4'
      const file = `${fileBase(id)}.${ext}`
      await writeFileAtomic(join(this.trailersDir, file), data)
      this.attachTrailerFile(id, file)
      void this.enforceTrailerLimit(file)
      return file
    })()
      .catch((err) => {
        log.warn(`caching trailer for ${id} failed:`, errorMessage(err))
        return null
      })
      .finally(() => this.previews.delete(id))
    this.previews.set(id, job)
  }

  private attachTrailerFile(id: string, file: string): void {
    const record = this.state.trailers[id]
    if (record?.status === 'available') {
      record.file = file
      this.changed()
    }
  }

  private async touch(file: string): Promise<void> {
    const now = new Date()
    await fs.utimes(join(this.trailersDir, file), now, now).catch(() => undefined)
  }

  /** Least-recently-played trailers are evicted once the cache passes its size cap. */
  private async enforceTrailerLimit(keep: string): Promise<void> {
    let entries: Array<{ name: string; size: number; mtime: number }>
    try {
      const names = await fs.readdir(this.trailersDir)
      entries = (
        await Promise.all(
          names.map(async (name) => {
            try {
              const st = await fs.stat(join(this.trailersDir, name))
              return st.isFile() ? { name, size: st.size, mtime: st.mtimeMs } : null
            } catch {
              return null
            }
          })
        )
      ).filter((e): e is { name: string; size: number; mtime: number } => e !== null)
    } catch {
      return
    }
    let total = entries.reduce((sum, e) => sum + e.size, 0)
    if (total <= TRAILER_CACHE_LIMIT_BYTES) return
    for (const entry of entries.sort((a, b) => a.mtime - b.mtime)) {
      if (total <= TRAILER_CACHE_LIMIT_BYTES) break
      if (entry.name === keep) continue
      await fs.rm(join(this.trailersDir, entry.name), { force: true })
      total -= entry.size
      this.detachTrailerFile(entry.name)
    }
  }

  private detachTrailerFile(file: string): void {
    for (const record of Object.values(this.state.trailers)) {
      if (record.status === 'available' && record.file === file) delete record.file
    }
    this.store.save()
  }

  async clearTrailerCache(): Promise<void> {
    await Promise.all(this.previews.values())
    const names = await fs.readdir(this.trailersDir).catch(() => [] as string[])
    await Promise.all(names.map((n) => fs.rm(join(this.trailersDir, n), { force: true })))
    for (const record of Object.values(this.state.trailers)) {
      if (record.status === 'available') delete record.file
    }
    this.store.save()
  }

  async cacheInfo(): Promise<MediaCacheInfo> {
    const [coverBytes, trailerBytes] = await Promise.all([directorySize(this.coversDir), directorySize(this.trailersDir)])
    return { coverBytes, trailerBytes }
  }

  // -------------------------------------------------------------- protocol

  /** glmedia://covers/<file> and glmedia://trailers/<file>, with Range support for video. */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const dir = url.hostname === 'covers' ? this.coversDir : url.hostname === 'trailers' ? this.trailersDir : null
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!dir || !/^[\w.-]+$/.test(name) || name.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    const path = join(dir, name)
    let size: number
    try {
      size = (await fs.stat(path)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': url.hostname === 'covers' ? 'public, max-age=31536000, immutable' : 'no-cache'
    }
    const body = (start?: number, end?: number): ReadableStream =>
      Readable.toWeb(createReadStream(path, start === undefined ? undefined : { start, end })) as unknown as ReadableStream

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')?.trim() ?? '')
    if (range && (range[1] || range[2])) {
      let start: number
      let end: number
      if (range[1] === '') {
        start = Math.max(0, size - Number(range[2]))
        end = size - 1
      } else {
        start = Number(range[1])
        end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      }
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      return new Response(body(start, end), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
      })
    }
    return new Response(body(), { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
  }
}
