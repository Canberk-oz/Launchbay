// Install sizes the stores don't report (Xbox/Store packages), measured by
// walking the install folder in the background and cached per package
// version. No Electron imports, so it is unit-tested under plain Node.

import { EventEmitter } from 'node:events'
import { promises as fs, type Dirent, type Stats } from 'node:fs'
import { join } from 'node:path'
import { JsonStore } from '../util/fsutil'
import { createLogger } from '../util/log'

const log = createLogger('sizes')

/** How long after a scan the first walk starts, so it never competes with startup. */
const START_DELAY_MS = 10_000
/** Entries handled between yields to the event loop. */
const YIELD_EVERY = 256

export type Measurement = { status: 'ok'; bytes: number } | { status: 'denied' | 'failed'; error: string }

/** The filesystem calls a walk makes; replaced in tests. */
export interface WalkIo {
  readdir(path: string): Promise<Dirent[]>
  lstat(path: string): Promise<Stats>
}

const realIo: WalkIo = {
  readdir: (path) => fs.readdir(path, { withFileTypes: true }),
  lstat: (path) => fs.lstat(path)
}

const code = (err: unknown): string | undefined => (err as NodeJS.ErrnoException)?.code

/**
 * Adds up the sizes of every file under `root` without following links.
 * Any access denial makes the whole result `denied`: a partial total would
 * understate the size, so "unknown" is the honest answer. Files that vanish
 * mid-walk are skipped.
 */
export async function measureFolder(root: string, io: WalkIo = realIo, signal?: AbortSignal): Promise<Measurement> {
  let bytes = 0
  let seen = 0
  const stack = [root]
  try {
    while (stack.length > 0) {
      if (signal?.aborted) return { status: 'failed', error: 'cancelled' }
      const dir = stack.pop()!
      let entries: Dirent[]
      try {
        entries = await io.readdir(dir)
      } catch (err) {
        if (code(err) === 'ENOENT' && dir !== root) continue
        throw err
      }
      for (const entry of entries) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) stack.push(path)
        else if (entry.isFile()) {
          try {
            bytes += (await io.lstat(path)).size
          } catch (err) {
            if (code(err) !== 'ENOENT') throw err
          }
        }
        // Symbolic links and junctions are not followed or counted.
        if (++seen % YIELD_EVERY === 0) await new Promise((resolve) => setImmediate(resolve))
      }
    }
  } catch (err) {
    const c = code(err)
    const error = err instanceof Error ? err.message : String(err)
    return { status: c === 'EACCES' || c === 'EPERM' ? 'denied' : 'failed', error }
  }
  return { status: 'ok', bytes }
}

interface SizeRecord {
  /** The provider's sizeKey when measured (Xbox: the package full name, which includes its version). */
  key: string
  status: Measurement['status']
  bytes?: number
  error?: string
  measuredAt: number
}

interface SizeState {
  version: 1
  sizes: Record<string, SizeRecord>
}

function normalize(raw: unknown): SizeState {
  const r = raw as Partial<SizeState> | null
  return { version: 1, sizes: r?.sizes && typeof r.sizes === 'object' ? r.sizes : {} }
}

export interface SizeJob {
  id: string
  installPath: string
  sizeKey?: string
  sizeOnDisk: number | null
}

/** What is known about a measured game's size right now. */
export type SizeLookup = { status: 'ok'; bytes: number } | { status: 'measuring' | 'denied' | 'failed' | 'none' }

/**
 * Measures, one game at a time and well after startup, the install folders
 * of games whose store reports no size. Results are cached under the game's
 * sizeKey, so a folder is walked again only when its package version changes
 * (or, for a failure, on a manual refresh). Emits 'changed' with the game id.
 */
export class SizeService extends EventEmitter {
  private readonly store: JsonStore<SizeState>
  private readonly io: WalkIo
  private readonly startDelayMs: number
  private readonly queue: SizeJob[] = []
  private running: Promise<void> | null = null
  private current: string | null = null
  private readonly abort = new AbortController()

  constructor(root: string, opts: { io?: WalkIo; startDelayMs?: number } = {}) {
    super()
    this.store = new JsonStore<SizeState>(join(root, 'sizes.json'), normalize(null))
    this.io = opts.io ?? realIo
    this.startDelayMs = opts.startDelayMs ?? START_DELAY_MS
  }

  async init(): Promise<void> {
    await this.store.load(normalize)
  }

  flush(): Promise<void> {
    return this.store.flush()
  }

  dispose(): void {
    this.abort.abort()
  }

  lookup(id: string, key: string | undefined): SizeLookup {
    if (!key) return { status: 'none' }
    if (this.current === id || this.queue.some((j) => j.id === id)) return { status: 'measuring' }
    const record = this.store.data.sizes[id]
    if (!record || record.key !== key) return { status: 'none' }
    return record.status === 'ok' ? { status: 'ok', bytes: record.bytes ?? 0 } : { status: record.status }
  }

  /** Queues games that need measuring. A manual refresh (`retryFailed`) also retries failures. */
  sync(games: SizeJob[], opts: { retryFailed: boolean }): void {
    let added = false
    for (const game of games) {
      if (!game.sizeKey || game.sizeOnDisk !== null) continue
      if (this.current === game.id || this.queue.some((j) => j.id === game.id)) continue
      const record = this.store.data.sizes[game.id]
      const cached = record?.key === game.sizeKey && (record.status !== 'failed' || !opts.retryFailed)
      if (cached) continue
      this.queue.push(game)
      added = true
      this.emit('changed', game.id) // now "measuring"
    }
    if (added && !this.running) {
      this.running = this.drain().finally(() => {
        this.running = null
      })
    }
  }

  /** Waits for the queue to empty (tests and diagnostics). */
  async idle(): Promise<void> {
    while (this.running) await this.running
  }

  private async drain(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.startDelayMs))
    while (this.queue.length > 0 && !this.abort.signal.aborted) {
      const job = this.queue.shift()!
      this.current = job.id
      const started = Date.now()
      const result = await measureFolder(job.installPath, this.io, this.abort.signal)
      this.current = null
      if (this.abort.signal.aborted) return
      this.store.data.sizes[job.id] = {
        key: job.sizeKey!,
        status: result.status,
        ...(result.status === 'ok' ? { bytes: result.bytes } : { error: result.error }),
        measuredAt: Date.now()
      }
      this.store.save()
      if (result.status === 'ok') log.info(`${job.id}: ${result.bytes} bytes in ${Date.now() - started} ms`)
      else log.warn(`${job.id}: size ${result.status} (${result.error})`)
      this.emit('changed', job.id)
    }
  }

  /** Forgets games no longer in the library. */
  prune(keep: ReadonlySet<string>): void {
    let changed = false
    for (const id of Object.keys(this.store.data.sizes)) {
      if (keep.has(id)) continue
      delete this.store.data.sizes[id]
      changed = true
    }
    for (let i = this.queue.length - 1; i >= 0; i--) if (!keep.has(this.queue[i].id)) this.queue.splice(i, 1)
    if (changed) this.store.save()
  }
}
