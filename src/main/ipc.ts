import { app, BrowserWindow, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { InitialState, Settings } from '@shared/types'
import type { HotkeyManager } from './hotkey'
import type { LaunchService } from './launch'
import type { LibraryService } from './library/library'
import type { MediaService } from './library/media'
import type { SettingsStore } from './settings'
import type { WindowManager } from './window'

export interface IpcDeps {
  library: LibraryService
  media: MediaService
  settings: SettingsStore
  hotkeys: HotkeyManager
  launcher: LaunchService
  windows: WindowManager
  isPackaged: boolean
  startHidden: boolean
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function registerIpc(deps: IpcDeps): void {
  const { library, media, settings, hotkeys, launcher, windows } = deps

  ipcMain.handle(IPC.getInitialState, (): InitialState => ({
    version: app.getVersion(),
    games: library.list(),
    settings: settings.get(),
    scan: library.scanStatus(),
    hotkey: hotkeys.getStatus(),
    isPackaged: deps.isPackaged,
    startHidden: deps.startHidden
  }))

  ipcMain.handle(IPC.refreshLibrary, () => library.refresh({ manual: true }))

  ipcMain.handle(IPC.setFavorite, (_e, id: unknown, value: unknown) => {
    if (library.get(asString(id))) library.setFavorite(asString(id), value === true)
  })

  ipcMain.handle(IPC.setHidden, (_e, id: unknown, value: unknown) => {
    if (library.get(asString(id))) library.setHidden(asString(id), value === true)
  })

  ipcMain.handle(IPC.launchGame, (_e, id: unknown) => launcher.launch(asString(id)))

  ipcMain.handle(IPC.getTrailer, async (_e, id: unknown) => {
    const game = library.get(asString(id))
    return game ? media.getTrailerSource(game) : null
  })

  ipcMain.handle(IPC.showContextMenu, (event: IpcMainInvokeEvent, id: unknown) => {
    const game = library.get(asString(id))
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!game || !win) return
    Menu.buildFromTemplate([
      { label: 'Play', click: () => event.sender.send(IPC.contextAction, { action: 'launch', id: game.id }) },
      {
        label: game.isFavorite ? 'Remove from favorites' : 'Add to favorites',
        click: () => library.setFavorite(game.id, !game.isFavorite)
      },
      { type: 'separator' },
      { label: 'Open install folder', click: () => void shell.openPath(game.installPath) },
      { label: 'Hide from library', click: () => library.setHidden(game.id, true) }
    ]).popup({ window: win })
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
