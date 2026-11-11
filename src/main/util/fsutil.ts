import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { sleep } from './concurrency'
import { createLogger } from './log'

const log = createLogger('store')

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Writes via a temp file and rename so a crash mid-write never leaves a
 * truncated cache. Windows can briefly refuse the rename while antivirus or
 * the indexer holds the target, so it retries a few times. `durable` also
 * flushes the data to disk before the rename, so a power cut can't leave an
 * empty file under the final name (worth it for the user's own data).
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array, opts: { durable?: boolean } = {}): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  if (opts.durable) {
    const handle = await fs.open(tmp, 'w')
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }
  } else {
    await fs.writeFile(tmp, data)
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        await fs.rm(tmp, { force: true })
        throw err
      }
      await sleep(40 * (attempt + 1))
    }
  }
}

export type JsonRead = { state: 'ok'; value: unknown } | { state: 'missing' } | { state: 'damaged'; error: string }

/**
 * Reads a JSON file and says which of three things happened: it parsed, it
 * isn't there, or it is there but can't be used (unreadable, empty, or not
 * JSON). Only the last is a problem: defaults must not silently replace it.
 */
export async function readJsonState(file: string): Promise<JsonRead> {
  let text: string
  for (let attempt = 0; ; attempt++) {
    try {
      text = await fs.readFile(file, 'utf8')
      break
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { state: 'missing' }
      // Antivirus or the indexer can hold a file for a moment on Windows.
      if (attempt < 3 && (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')) {
        await sleep(60 * (attempt + 1))
        continue
      }
      return { state: 'damaged', error: err instanceof Error ? err.message : String(err) }
    }
  }
  try {
    return { state: 'ok', value: JSON.parse(stripBom(text)) }
  } catch (err) {
    return { state: 'damaged', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * A JSON document persisted with debounced atomic writes. Callers mutate
 * `data` and call `save()`; bursts of changes collapse into one write.
 *
 * A file that exists but can't be read or parsed is never overwritten in
 * place: the first save moves it aside (`name.damaged-<time>.json`) first,
 * so favorites, collections and tracked playtime can still be recovered.
 */
export class JsonStore<T> {
  data: T
  private readonly file: string
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()
  private readonly delayMs: number
  private damaged = false

  constructor(file: string, initial: T, delayMs = 400) {
    this.file = file
    this.data = initial
    this.delayMs = delayMs
  }

  async load(normalize: (raw: unknown) => T): Promise<T> {
    const read = await readJsonState(this.file)
    if (read.state === 'damaged') {
      this.damaged = true
      log.error(`${this.file} could not be read (${read.error}); starting from defaults and keeping the file as a .damaged copy`)
    }
    this.data = normalize(read.state === 'ok' ? read.value : null)
    return this.data
  }

  save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delayMs)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const json = JSON.stringify(this.data)
    this.writing = this.writing
      .then(() => this.setDamagedAside())
      .then(() => writeFileAtomic(this.file, json, { durable: true }))
      .catch((err) => log.error(`could not save ${this.file}; the change stays in memory until the next save`, err))
    await this.writing
  }

  /** Before the first write over a file that failed to load, keep that file under another name. */
  private async setDamagedAside(): Promise<void> {
    if (!this.damaged) return
    this.damaged = false
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '')
    const copy = this.file.replace(/(\.json)?$/i, `.damaged-${stamp}.json`)
    try {
      await fs.rename(this.file, copy)
      log.warn(`kept the unreadable ${this.file} as ${copy}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn(`could not set ${this.file} aside before replacing it`, err)
    }
  }
}

/** Sums file sizes in a directory (non-recursive). */
export async function directorySize(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const sizes = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map((e) =>
          fs.stat(`${dir}/${e.name}`).then(
            (st) => st.size,
            () => 0 // raced with a delete
          )
        )
    )
    return sizes.reduce((sum, size) => sum + size, 0)
  } catch {
    return 0
  }
}
