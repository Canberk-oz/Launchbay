import type {
  ContextAction,
  Game,
  HotkeyChangeResult,
  HotkeyStatus,
  InitialState,
  LaunchResult,
  MediaCacheInfo,
  ScanStatus,
  Settings,
  WindowVisibility
} from './types'

export type Unsubscribe = () => void

/** The bridge the preload script exposes to the renderer as `window.launchbay`. */
export interface LaunchbayApi {
  getInitialState(): Promise<InitialState>
  refreshLibrary(): Promise<void>
  setFavorite(id: string, favorite: boolean): Promise<void>
  setHidden(id: string, hidden: boolean): Promise<void>
  launchGame(id: string): Promise<LaunchResult>
  getTrailer(id: string): Promise<{ src: string } | null>
  showContextMenu(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  setHotkey(accelerator: string): Promise<HotkeyChangeResult>
  suspendHotkey(suspended: boolean): Promise<void>
  hideWindow(): Promise<void>
  getMediaCacheInfo(): Promise<MediaCacheInfo>
  clearTrailerCache(): Promise<void>

  onLibraryUpdated(cb: (games: Game[]) => void): Unsubscribe
  onScanStatus(cb: (status: ScanStatus) => void): Unsubscribe
  onSettingsChanged(cb: (settings: Settings) => void): Unsubscribe
  onHotkeyStatus(cb: (status: HotkeyStatus) => void): Unsubscribe
  onWindowVisibility(cb: (visibility: WindowVisibility) => void): Unsubscribe
  onContextAction(cb: (action: { action: ContextAction; id: string }) => void): Unsubscribe
  onOpenSettings(cb: () => void): Unsubscribe
}
