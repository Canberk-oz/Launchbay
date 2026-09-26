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

/**
 * How a cover fills its 2:3 tile. `art` is cropped to fill it edge to edge.
 * `band` is art too wide to crop (a 16:9 splash, a Steam header): it spans the
 * tile's width over a blurred copy of itself. `mark` is a logo or icon on a
 * plain background: it sits centered on `coverBackground`.
 */
export type CoverFrame = 'art' | 'band' | 'mark'

export type SizeStatus = 'known' | 'measuring' | 'denied' | 'failed' | 'unreported'

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
  coverFrame: CoverFrame
  /**
   * CSS color behind a `mark`: the solid color the asset was drawn on, or the
   * one its package declares. Null means a blurred, enlarged copy of the image.
   */
  coverBackground: string | null
  /** The cover's glow color (#rrggbb), used for hover and launch; null when the cover is colorless. */
  coverAmbient: string | null
  /** Direct trailer URL (a Steam DASH manifest or progressive video); Steam only. */
  trailerUrl: string | null
  trailerState: TrailerState
  sizeOnDisk: number | null
  /**
   * Why `sizeOnDisk` is or isn't known. `measuring`: Launchbay is walking the
   * install folder. `denied`: Windows refused access to part of it, so the
   * size is unknown rather than a partial guess. `failed`: the walk failed.
   * `unreported`: the store gives no size and there is nothing to measure.
   */
  sizeStatus: SizeStatus
  playtimeMinutes: number | null
  isFavorite: boolean
  /** Epoch ms. */
  favoritedAt: number | null
  /** Epoch ms: the later of the platform's own record and launches from Launchbay. */
  lastPlayed: number | null
  /**
   * Epoch ms the game arrived on this PC: its install folder's creation time
   * when Launchbay first saw it, otherwise that moment. Null until the first
   * scan that finds it.
   */
  addedAt: number | null
  /** Steam only: an update is waiting. Null means unknown (Epic and Xbox keep no local record). */
  updateAvailable: boolean | null
  isHidden: boolean
}

export type ViewMode = 'grid' | 'list'
export type SortMode = 'name' | 'recent' | 'size' | 'added'

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

export const DEFAULT_SETTINGS: Settings = {
  hotkey: DEFAULT_HOTKEY,
  hotkeyEnabled: true,
  closeToTray: true,
  hideAfterLaunch: true,
  launchAtLogin: false,
  viewMode: 'grid',
  tileSize: TILE_SIZE_DEFAULT,
  sortMode: 'name'
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

/**
 * The games that changed since the previous patch. `upsert` carries whole
 * records (new or changed); `remove` the ids that left the library. `seq`
 * increases by one per patch, so the renderer can skip patches its initial
 * state already includes.
 */
export interface LibraryPatch {
  seq: number
  upsert: Game[]
  remove: string[]
}

export interface InitialState {
  version: string
  games: Game[]
  /** The last patch already reflected in `games`. */
  librarySeq: number
  settings: Settings
  scan: ScanStatus
  hotkey: HotkeyStatus
  isPackaged: boolean
  startHidden: boolean
}

/** `overlay`: summoned by the global hotkey; `show`: opened normally (tray, second launch). */
export type WindowVisibility = 'show' | 'overlay' | 'hide'

/** A message from the main process for the renderer to show as a toast. */
export interface Notice {
  tone: 'error' | 'warning' | 'info'
  title: string
  message?: string
}

/** Right-click menu picks the renderer carries out (they start UI there). */
export type ContextAction = 'launch' | 'properties'

/** Extra facts shown in a game's properties, fetched when the panel opens. */
export interface GameDetails {
  /** Where the cached cover came from: a URL or a local file path. */
  coverSource: string | null
}

export type ExportResult =
  | { saved: true; path: string; count: number }
  | { saved: false; error?: string } // cancelled, or `error` when writing failed

export interface MediaCacheInfo {
  coverBytes: number
  trailerBytes: number
}
