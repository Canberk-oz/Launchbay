// Types shared by the main process, the preload bridge and the renderer.

export type Platform = 'steam' | 'epic' | 'xbox'

export const PLATFORMS: readonly Platform[] = ['steam', 'epic', 'xbox']

export const PLATFORM_LABELS: Record<Platform, string> = {
  steam: 'Steam',
  epic: 'Epic',
  xbox: 'Xbox'
}

/**
 * `unknown` means the trailer has not been looked up yet (it is resolved lazily
 * in the background, or on first hover); `none` means the lookup succeeded and
 * the game has no trailer, or the lookup failed and will be retried on the next
 * manual refresh.
 */
export type TrailerState = 'unknown' | 'available' | 'none'

export interface Game {
  /** Stable id: `${platform}:${platformId}`. */
  id: string
  platform: Platform
  /** Steam appid, Epic AppName, or Xbox PackageFamilyName. */
  platformId: string
  name: string
  installPath: string
  launchCommand: string
  /** `glmedia://` URL of the locally cached cover, or null when none is available. */
  coverImageUrl: string | null
  /** The cover is a transparent logo (Store packages) rather than full-bleed art. */
  coverIsLogo: boolean
  /** Direct trailer URL (a Steam DASH manifest or progressive video); Steam only. */
  trailerUrl: string | null
  trailerState: TrailerState
  sizeOnDisk: number | null
  playtimeMinutes: number | null
  /** Epoch ms of the last scan that saw this game. */
  lastScanned: number
  isFavorite: boolean
  /** Epoch ms. */
  favoritedAt: number | null
  /** Epoch ms: the later of the platform's own record and launches from Launchbay. */
  lastPlayed: number | null
  isHidden: boolean
}

export type ViewMode = 'grid' | 'list'
export type SortMode = 'name' | 'recent' | 'size'

export const TILE_SIZE_MIN = 100
export const TILE_SIZE_MAX = 320
export const TILE_SIZE_DEFAULT = 184

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+G'

export interface Settings {
  /** Electron accelerator string. */
  hotkey: string
  hotkeyEnabled: boolean
  closeToTray: boolean
  hideAfterLaunch: boolean
  launchAtLogin: boolean
  viewMode: ViewMode
  tileSize: number
  sortMode: SortMode
}

export type HotkeyError = 'in-use' | 'invalid'

export interface HotkeyStatus {
  accelerator: string
  enabled: boolean
  registered: boolean
  error: HotkeyError | null
}

export interface HotkeyChangeResult {
  ok: boolean
  /** The accelerator that was attempted. */
  accelerator: string
  error: HotkeyError | null
  /** The status now in effect (unchanged from before when `ok` is false). */
  status: HotkeyStatus
}

export interface ScanStatus {
  scanning: boolean
  /** Epoch ms of the last completed scan. */
  lastScanAt: number | null
}

export type LaunchResult =
  | { ok: true; confirmed: boolean }
  | { ok: false; error: string }

export interface InitialState {
  version: string
  games: Game[]
  settings: Settings
  scan: ScanStatus
  hotkey: HotkeyStatus
  isPackaged: boolean
  startHidden: boolean
}

/** `overlay`: summoned by the global hotkey; `show`: opened normally (tray, second launch). */
export type WindowVisibility = 'show' | 'overlay' | 'hide'

export type ContextAction = 'launch'

export interface MediaCacheInfo {
  coverBytes: number
  trailerBytes: number
}
