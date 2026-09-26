import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import {
  DEFAULT_HOTKEY,
  TILE_SIZE_DEFAULT,
  TILE_SIZE_MAX,
  TILE_SIZE_MIN,
  type Settings,
  type SortMode,
  type ViewMode
} from '@shared/types'
import { JsonStore } from './util/fsutil'

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

const VIEW_MODES: ViewMode[] = ['grid', 'list']
const SORT_MODES: SortMode[] = ['name', 'recent', 'size']

/** Merges untrusted input (the settings file, or a renderer patch) over a base, dropping invalid fields. */
export function sanitizeSettings(input: unknown, base: Settings): Settings {
  const r = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof Settings, unknown>>
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
  const tile = typeof r.tileSize === 'number' && Number.isFinite(r.tileSize) ? r.tileSize : base.tileSize
  return {
    hotkey: typeof r.hotkey === 'string' && r.hotkey.trim() ? r.hotkey.trim() : base.hotkey,
    hotkeyEnabled: bool(r.hotkeyEnabled, base.hotkeyEnabled),
    closeToTray: bool(r.closeToTray, base.closeToTray),
    hideAfterLaunch: bool(r.hideAfterLaunch, base.hideAfterLaunch),
    launchAtLogin: bool(r.launchAtLogin, base.launchAtLogin),
    viewMode: VIEW_MODES.includes(r.viewMode as ViewMode) ? (r.viewMode as ViewMode) : base.viewMode,
    tileSize: Math.round(Math.min(TILE_SIZE_MAX, Math.max(TILE_SIZE_MIN, tile))),
    sortMode: SORT_MODES.includes(r.sortMode as SortMode) ? (r.sortMode as SortMode) : base.sortMode
  }
}

export class SettingsStore extends EventEmitter {
  private readonly store: JsonStore<Settings>

  constructor(root: string) {
    super()
    this.store = new JsonStore<Settings>(join(root, 'settings.json'), { ...DEFAULT_SETTINGS })
  }

  async load(): Promise<Settings> {
    return this.store.load((raw) => sanitizeSettings(raw, DEFAULT_SETTINGS))
  }

  get(): Settings {
    return this.store.data
  }

  update(patch: Partial<Settings>): Settings {
    const next = sanitizeSettings({ ...this.store.data, ...patch }, this.store.data)
    const prev = this.store.data
    this.store.data = next
    this.store.save()
    this.emit('changed', next, prev)
    return next
  }

  flush(): Promise<void> {
    return this.store.flush()
  }
}
