import { net } from 'electron'

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export interface HttpOptions {
  timeoutMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Largest body httpGetBuffer will hold in memory; larger responses are refused. */
  maxBytes?: number
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/** A response bigger than the caller is prepared to buffer. Not worth retrying. */
export class ResponseTooLargeError extends Error {
  constructor(url: string, limit: number) {
    super(`Response for ${url} is larger than ${Math.round(limit / (1024 * 1024))} MB`)
    this.name = 'ResponseTooLargeError'
  }
}

/**
 * GET through Chromium's network stack (honours system proxy settings and
 * certificates). Rejects with HttpError for non-2xx responses.
 */
export async function httpGet(url: string, opts: HttpOptions = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const res = await net.fetch(url, { headers: opts.headers, signal })
  if (!res.ok) {
    // Drain the body so the connection can be reused.
    await res.arrayBuffer().catch(() => undefined)
    throw new HttpError(res.status, url)
  }
  return res
}

/** GET into memory, refusing bodies over `maxBytes` (by Content-Length, and again while reading). */
export async function httpGetBuffer(url: string, opts?: HttpOptions): Promise<{ data: Buffer; contentType: string }> {
  const res = await httpGet(url, opts)
  const limit = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  const contentType = res.headers.get('content-type') ?? ''
  if (Number(res.headers.get('content-length') ?? 0) > limit) {
    await res.body?.cancel().catch(() => undefined)
    throw new ResponseTooLargeError(url, limit)
  }
  const reader = res.body?.getReader()
  if (!reader) return { data: Buffer.alloc(0), contentType }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw new ResponseTooLargeError(url, limit)
    }
    chunks.push(value)
  }
  return { data: Buffer.concat(chunks), contentType }
}

export async function httpGetText(url: string, opts?: HttpOptions): Promise<string> {
  return (await httpGet(url, opts)).text()
}

/** Rate limits, server errors, timeouts and network failures are worth retrying later. */
export function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500
  if (err instanceof ResponseTooLargeError) return false
  return true
}
