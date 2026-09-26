/** Returns a function that runs at most `max` async jobs at once, in FIFO order. */
export function createLimiter(max: number): <T>(job: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: Array<() => void> = []

  const pump = (): void => {
    while (active < max && queue.length > 0) {
      active++
      queue.shift()!()
    }
  }

  return <T>(job: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        job()
          .then(resolve, reject)
          .finally(() => {
            active--
            pump()
          })
      })
      pump()
    })
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Calls `fn` at most once per `ms`, trailing, coalescing bursts. */
export function throttle(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null
  let last = 0
  return () => {
    if (timer) return
    const wait = Math.max(0, last + ms - Date.now())
    timer = setTimeout(() => {
      timer = null
      last = Date.now()
      fn()
    }, wait)
  }
}
