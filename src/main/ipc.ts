import { app, BrowserWindow, dialog, ipcMain as electronIpc, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ExportResult, InitialState, RefreshResult, Settings } from '@shared/types'
import type { GameActions } from './gameActions'
import type { HotkeyManager } from './hotkey'
import { libraryToCsv, libraryToJson } from './library/exportFormat'
import type { LibraryService } from './library/library'
import type { MediaService } from './library/media'
import type { SettingsStore } from './settings'
import { writeFileAtomic } from './util/fsutil'
import { createLogger } from './util/log'
import type { WindowManager } from './window'

const log = createLogger('ipc')

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

  // Only the app window's own page may call in: not a subframe, not any other web contents.
  const trusted = (event: IpcMainInvokeEvent): boolean =>
    event.sender === windows.win?.webContents && event.senderFrame !== null && event.senderFrame === event.sender.mainFrame
  const ipcMain = {
    handle<A extends unknown[], R>(channel: string, listener: (event: IpcMainInvokeEvent, ...args: A) => R): void {
      electronIpc.handle(channel, (event, ...args) => {
        if (!trusted(event)) {
          log.warn(`rejected ${channel} from an unexpected sender`)
          throw new Error('Not allowed')
        }
        return listener(event, ...(args as A))
      })
    }
  }

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

  ipcMain.handle(IPC.refreshLibrary, async (): Promise<RefreshResult> => {
    await library.refresh({ manual: true })
    return { games: library.list().filter((g) => !g.isHidden).length, failed: library.scanStatus().failed }
  })

  ipcMain.handle(IPC.setFavorite, (_e, id: unknown, value: unknown) => actions.setFavorite(asString(id), value === true))

  ipcMain.handle(IPC.setHidden, (_e, id: unknown, value: unknown) => actions.setHidden(asString(id), value === true))

  ipcMain.handle(IPC.setCollections, (_e, id: unknown, names: unknown) =>
    actions.setCollections(asString(id), Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [])
  )

  ipcMain.handle(IPC.launchGame, (_e, id: unknown) => actions.launch(asString(id)))

  ipcMain.handle(IPC.getTrailer, async (_e, id: unknown) => {
    const game = library.get(asString(id))
    return game ? media.getTrailerSource(game) : null
  })

  ipcMain.handle(IPC.getGameDetails, (_e, id: unknown) => actions.details(asString(id)))

  ipcMain.handle(IPC.openScreenshot, (_e, url: unknown) => actions.openScreenshot(asString(url)))

  ipcMain.handle(IPC.showContextMenu, (event: IpcMainInvokeEvent, id: unknown, at: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const p = at as { x?: unknown; y?: unknown } | null
    const point = p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : undefined
    actions.showMenu(asString(id), win, (action, gameId) => event.sender.send(IPC.contextAction, { action, id: gameId }), point)
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

  ipcMain.handle(IPC.exportLibrary, async (event, format: unknown): Promise<ExportResult> => {
    const kind = format === 'csv' ? 'csv' : 'json'
    const win = BrowserWindow.fromWebContents(event.sender)
    const stamp = new Date().toISOString().slice(0, 10)
    const options = {
      title: 'Export library',
      defaultPath: join(app.getPath('documents'), `Launchbay library ${stamp}.${kind}`),
      filters: [kind === 'csv' ? { name: 'CSV spreadsheet', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }]
    }
    const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (choice.canceled || !choice.filePath) return { saved: false }
    const games = library.list()
    try {
      const text = kind === 'csv' ? libraryToCsv(games) : libraryToJson(games, { version: app.getVersion(), exportedAt: Date.now() })
      await writeFileAtomic(choice.filePath, text)
    } catch (err) {
      log.warn(`export to ${choice.filePath} failed`, err)
      return { saved: false, error: err instanceof Error ? err.message : String(err) }
    }
    return { saved: true, path: choice.filePath, count: games.length }
  })
}
