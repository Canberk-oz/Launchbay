import { acceleratorKeys } from '@shared/accelerator'
import type { Game, Settings } from '@shared/types'
import { useStore, type LaunchState, type Rect, type Toast } from './store'

const api = window.launchbay
const get = useStore.getState
const set = useStore.setState

// ------------------------------------------------------------------ toasts

let toastSeq = 0

export function pushToast(toast: Omit<Toast, 'id'>, ttlMs = 5200): number {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }))
  if (ttlMs > 0) setTimeout(() => dismissToast(id), ttlMs)
  return id
}

export function dismissToast(id: number): void {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

// --------------------------------------------------------------- settings

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingPatch: Partial<Settings> = {}

/** Local edits not yet persisted; they win over settings pushed back from the main process. */
export function pendingSettings(): Partial<Settings> {
  return pendingPatch
}

/** Applies a settings change locally at once and persists it shortly after (slider drags coalesce). */
export function updateSettings(patch: Partial<Settings>, immediate = false): void {
  set((s) => ({ settings: { ...s.settings, ...patch } }))
  pendingPatch = { ...pendingPatch, ...patch }
  if (persistTimer) clearTimeout(persistTimer)
  const flush = (): void => {
    const toSend = pendingPatch
    pendingPatch = {}
    persistTimer = null
    void api.updateSettings(toSend)
  }
  if (immediate) flush()
  else persistTimer = setTimeout(flush, 250)
}

// ------------------------------------------------------------------ games

export function toggleFavorite(game: Game): void {
  const favorite = !game.isFavorite
  set((s) => ({
    games: s.games.map((g) =>
      g.id === game.id ? { ...g, isFavorite: favorite, favoritedAt: favorite ? Date.now() : null } : g
    )
  }))
  void api.setFavorite(game.id, favorite)
}

export function unhideGame(id: string): void {
  set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, isHidden: false } : g)) }))
  void api.setHidden(id, false)
}

export async function refreshLibrary(): Promise<void> {
  if (get().scan.scanning) return
  set((s) => ({ scan: { ...s.scan, scanning: true } }))
  try {
    await api.refreshLibrary()
    const count = get().games.filter((g) => !g.isHidden).length
    pushToast({ tone: 'info', title: 'Library refreshed', message: `${count} ${count === 1 ? 'game' : 'games'} on this PC.` }, 3200)
  } catch {
    pushToast({ tone: 'error', title: 'Refresh failed', message: 'The library could not be rescanned. Try again.' })
  }
}

export function openSettings(): void {
  set({ settingsOpen: true })
}

export function closeSettings(): void {
  set({ settingsOpen: false })
}

export function focusSearch(): void {
  set((s) => ({ focusSearchTick: s.focusSearchTick + 1 }))
}

// ----------------------------------------------------------------- launch

const EXPAND_MS = 520
const MIN_HOLD_MS = 1100
const RESULT_HOLD_MS = 650
const SAFETY_TIMEOUT_MS = 13_000
export const LAUNCH_CLOSE_MS = 320

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function rectOf(el: Element | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return null
  if (r.bottom < 0 || r.top > window.innerHeight) return null
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

let launchSeq = 0

/** Updates the launch overlay only if it still belongs to launch `token`. */
function patchLaunch(token: number, patch: Partial<LaunchState> | null): void {
  set((s) => {
    if (!s.launch || s.launch.token !== token) return {}
    return { launch: patch === null ? null : { ...s.launch, ...patch } }
  })
}

/** Returns to the grid early; the launch itself carries on in the background. */
export function dismissLaunch(): void {
  const launch = get().launch
  if (!launch || launch.phase === 'closing') return
  patchLaunch(launch.token, { phase: 'closing' })
  setTimeout(() => patchLaunch(launch.token, null), LAUNCH_CLOSE_MS)
}

function markTileError(id: string, message: string): void {
  set((s) => ({ tileErrors: { ...s.tileErrors, [id]: message } }))
  setTimeout(() => {
    set((s) => {
      const next = { ...s.tileErrors }
      delete next[id]
      return { tileErrors: next }
    })
  }, 6000)
}

/**
 * Plays the launch transition while the main process hands the game to its
 * launcher. Holds on the blurred cover until the game is detected (or ~9s
 * pass), then fades back; a failure fades back at once and marks the tile.
 */
export async function launchGame(game: Game, originEl: Element | null): Promise<void> {
  if (get().launch) return
  const token = ++launchSeq
  const started = Date.now()
  set({ launch: { token, game, origin: rectOf(originEl), phase: 'opening', status: 'starting' } })
  setTimeout(() => {
    if (get().launch?.phase === 'opening') patchLaunch(token, { phase: 'waiting' })
  }, EXPAND_MS)

  const result = await Promise.race([
    api
      .launchGame(game.id)
      .catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })),
    sleep(SAFETY_TIMEOUT_MS).then(() => ({ ok: true as const, confirmed: false }))
  ])

  if (!result.ok) {
    await sleep(Math.max(0, EXPAND_MS - (Date.now() - started)))
    patchLaunch(token, { status: 'failed', phase: 'closing' })
    await sleep(LAUNCH_CLOSE_MS)
    patchLaunch(token, null)
    markTileError(game.id, result.error)
    pushToast({ tone: 'error', title: `Couldn’t launch ${game.name}`, message: result.error }, 8000)
    return
  }

  patchLaunch(token, { status: result.confirmed ? 'running' : 'handed-off' })
  await sleep(Math.max(RESULT_HOLD_MS, MIN_HOLD_MS - (Date.now() - started)))
  patchLaunch(token, { phase: 'closing' })
  await sleep(LAUNCH_CLOSE_MS)
  patchLaunch(token, null)
  if (result.confirmed && get().settings.hideAfterLaunch) void api.hideWindow()
}

// ------------------------------------------------------------------ hotkey

export function hotkeyLabel(accelerator: string): string {
  return acceleratorKeys(accelerator).join(' + ')
}
