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

export async function httpGetBuffer(url: string, opts?: HttpOptions): Promise<{ data: Buffer; contentType: string }> {
  const res = await httpGet(url, opts)
  const data = Buffer.from(await res.arrayBuffer())
  return { data, contentType: res.headers.get('content-type') ?? '' }
}

export async function httpGetText(url: string, opts?: HttpOptions): Promise<string> {
  return (await httpGet(url, opts)).text()
}

/** Rate limits, server errors, timeouts and network failures are worth retrying later. */
export function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500
  return true
}
