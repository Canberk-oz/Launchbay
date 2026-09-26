import { create } from 'zustand'
import {
  DEFAULT_HOTKEY,
  DEFAULT_SETTINGS,
  type Game,
  type HotkeyStatus,
  type InitialState,
  type LibraryPatch,
  type ScanStatus,
  type Settings
} from '@shared/types'
import { applyLibraryPatch, type LibraryFilter } from './lib/library'

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
  /** The last library patch reflected in `games`. */
  librarySeq: number
  settings: Settings
  hotkey: HotkeyStatus
  scan: ScanStatus
  search: string
  filter: LibraryFilter
  settingsOpen: boolean
  /** The game whose properties sheet is open. */
  propertiesId: string | null
  /** Set when Properties opened to add a collection: that input takes focus. */
  propertiesFocus: 'collections' | null
  diskUsageOpen: boolean
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
  librarySeq: 0,
  settings: DEFAULT_SETTINGS,
  hotkey: { accelerator: DEFAULT_HOTKEY, enabled: true, registered: false, error: null },
  scan: { scanning: false, lastScanAt: null },
  search: '',
  filter: 'all',
  settingsOpen: false,
  propertiesId: null,
  propertiesFocus: null,
  diskUsageOpen: false,
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
    librarySeq: initial.librarySeq,
    settings: initial.settings,
    hotkey: initial.hotkey,
    scan: initial.scan,
    windowHidden: initial.startHidden
  })
}

/** Merges a library patch, skipping any the current games already include. */
export function applyPatch(patch: LibraryPatch): void {
  useStore.setState((s) =>
    patch.seq <= s.librarySeq ? {} : { games: applyLibraryPatch(s.games, patch), librarySeq: patch.seq }
  )
}

/** Whether any side sheet (settings, properties, disk usage) is open. */
export function anySheetOpen(s: Pick<AppState, 'settingsOpen' | 'propertiesId' | 'diskUsageOpen'>): boolean {
  return s.settingsOpen || s.propertiesId !== null || s.diskUsageOpen
}
