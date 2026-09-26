import { create } from 'zustand'
import {
  DEFAULT_HOTKEY,
  TILE_SIZE_DEFAULT,
  type Game,
  type HotkeyStatus,
  type InitialState,
  type ScanStatus,
  type Settings
} from '@shared/types'
import type { PlatformFilter } from './lib/library'

export interface Toast {
  id: number
  tone: 'error' | 'warning' | 'info'
  title: string
  message?: string
  action?: { label: string; run: () => void }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** opening: cover expanding; waiting: held until the launcher hands off; closing: fading back to the grid. */
export type LaunchPhase = 'opening' | 'waiting' | 'closing'
export type LaunchStatus = 'starting' | 'running' | 'handed-off' | 'failed'

export interface LaunchState {
  /** Distinguishes launches so a finished flow never closes a newer one. */
  token: number
  game: Game
  origin: Rect | null
  phase: LaunchPhase
  status: LaunchStatus
}

export interface AppState {
  ready: boolean
  appVersion: string
  isPackaged: boolean
  games: Game[]
  settings: Settings
  hotkey: HotkeyStatus
  scan: ScanStatus
  search: string
  platform: PlatformFilter
  settingsOpen: boolean
  launch: LaunchState | null
  toasts: Toast[]
  /** Transient "couldn't launch" marks on tiles, by game id. */
  tileErrors: Record<string, string>
  /** True while the window was summoned by the global hotkey. */
  overlay: boolean
  windowHidden: boolean
  /** Bumped to ask the search field to take focus. */
  focusSearchTick: number
}

export const useStore = create<AppState>(() => ({
  ready: false,
  appVersion: '',
  isPackaged: false,
  games: [],
  settings: {
    hotkey: DEFAULT_HOTKEY,
    hotkeyEnabled: true,
    closeToTray: true,
    hideAfterLaunch: true,
    launchAtLogin: false,
    viewMode: 'grid',
    tileSize: TILE_SIZE_DEFAULT,
    sortMode: 'name'
  },
  hotkey: { accelerator: DEFAULT_HOTKEY, enabled: true, registered: false, error: null },
  scan: { scanning: false, lastScanAt: null },
  search: '',
  platform: 'all',
  settingsOpen: false,
  launch: null,
  toasts: [],
  tileErrors: {},
  overlay: false,
  windowHidden: false,
  focusSearchTick: 0
}))

export function hydrate(initial: InitialState): void {
  useStore.setState({
    ready: true,
    appVersion: initial.version,
    isPackaged: initial.isPackaged,
    games: initial.games,
    settings: initial.settings,
    hotkey: initial.hotkey,
    scan: initial.scan,
    windowHidden: initial.startHidden
  })
}
