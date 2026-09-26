import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

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

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(stripBom(await fs.readFile(file, 'utf8'))) as T
  } catch {
    return null
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Writes via a temp file and rename so a crash mid-write never leaves a
 * truncated cache. Windows can briefly refuse the rename while antivirus or
 * the indexer holds the target, so it retries a few times.
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  await fs.writeFile(tmp, data)
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

/**
 * A JSON document persisted with debounced atomic writes. Callers mutate
 * `data` and call `save()`; bursts of changes collapse into one write.
 */
export class JsonStore<T> {
  data: T
  private readonly file: string
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()
  private readonly delayMs: number

  constructor(file: string, initial: T, delayMs = 400) {
    this.file = file
    this.data = initial
    this.delayMs = delayMs
  }

  async load(normalize: (raw: unknown) => T): Promise<T> {
    const raw = await readJsonFile<unknown>(this.file)
    this.data = normalize(raw)
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
    this.writing = this.writing.then(() => writeFileAtomic(this.file, json)).catch(() => undefined)
    await this.writing
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
