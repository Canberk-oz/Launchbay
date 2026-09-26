import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { InitialState, Settings } from '@shared/types'
import type { GameActions } from './gameActions'
import type { HotkeyManager } from './hotkey'
import type { LibraryService } from './library/library'
import type { MediaService } from './library/media'
import type { SettingsStore } from './settings'
import type { WindowManager } from './window'

export interface IpcDeps {
  library: LibraryService
  media: MediaService
  settings: SettingsStore
  hotkeys: HotkeyManager
  actions: GameActions
  windows: WindowManager
  isPackaged: boolean
  startHidden: boolean
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function registerIpc(deps: IpcDeps): void {
  const { library, media, settings, hotkeys, actions, windows } = deps

  ipcMain.handle(IPC.getInitialState, (): InitialState => ({
    version: app.getVersion(),
    games: library.list(),
    librarySeq: library.patchSeq(),
    settings: settings.get(),
    scan: library.scanStatus(),
    hotkey: hotkeys.getStatus(),
    isPackaged: deps.isPackaged,
    startHidden: deps.startHidden
  }))

  ipcMain.handle(IPC.refreshLibrary, () => library.refresh({ manual: true }))

  ipcMain.handle(IPC.setFavorite, (_e, id: unknown, value: unknown) => actions.setFavorite(asString(id), value === true))

  ipcMain.handle(IPC.setHidden, (_e, id: unknown, value: unknown) => actions.setHidden(asString(id), value === true))

  ipcMain.handle(IPC.launchGame, (_e, id: unknown) => actions.launch(asString(id)))

  ipcMain.handle(IPC.getTrailer, async (_e, id: unknown) => {
    const game = library.get(asString(id))
    return game ? media.getTrailerSource(game) : null
  })

  ipcMain.handle(IPC.getGameDetails, (_e, id: unknown) => actions.details(asString(id)))

  ipcMain.handle(IPC.showContextMenu, (event: IpcMainInvokeEvent, id: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    actions.showMenu(asString(id), win, (action, gameId) => event.sender.send(IPC.contextAction, { action, id: gameId }))
  })

  ipcMain.handle(IPC.updateSettings, (_e, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return settings.get()
    // The hotkey itself changes only through IPC.setHotkey, which verifies the registration.
    const rest: Partial<Settings> = { ...(patch as Partial<Settings>) }
    delete rest.hotkey
    return settings.update(rest)
  })

  ipcMain.handle(IPC.setHotkey, (_e, accelerator: unknown) => {
    const result = hotkeys.change(asString(accelerator))
    if (result.ok) settings.update({ hotkey: result.accelerator, hotkeyEnabled: true })
    return result
  })

  ipcMain.handle(IPC.suspendHotkey, (_e, suspended: unknown) => hotkeys.suspend(suspended === true))

  ipcMain.handle(IPC.hideWindow, () => windows.hide())

  ipcMain.handle(IPC.getMediaCacheInfo, () => media.cacheInfo())

  ipcMain.handle(IPC.clearTrailerCache, () => media.clearTrailerCache())
}
