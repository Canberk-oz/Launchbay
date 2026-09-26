import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { LaunchbayApi, Unsubscribe } from '@shared/api'
import { IPC } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: LaunchbayApi = {
  getInitialState: () => ipcRenderer.invoke(IPC.getInitialState),
  refreshLibrary: () => ipcRenderer.invoke(IPC.refreshLibrary),
  setFavorite: (id, favorite) => ipcRenderer.invoke(IPC.setFavorite, id, favorite),
  setHidden: (id, hidden) => ipcRenderer.invoke(IPC.setHidden, id, hidden),
  launchGame: (id) => ipcRenderer.invoke(IPC.launchGame, id),
  getTrailer: (id) => ipcRenderer.invoke(IPC.getTrailer, id),
  showContextMenu: (id) => ipcRenderer.invoke(IPC.showContextMenu, id),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  setHotkey: (accelerator) => ipcRenderer.invoke(IPC.setHotkey, accelerator),
  suspendHotkey: (suspended) => ipcRenderer.invoke(IPC.suspendHotkey, suspended),
  hideWindow: () => ipcRenderer.invoke(IPC.hideWindow),
  getMediaCacheInfo: () => ipcRenderer.invoke(IPC.getMediaCacheInfo),
  clearTrailerCache: () => ipcRenderer.invoke(IPC.clearTrailerCache),

  onLibraryUpdated: (cb) => subscribe(IPC.libraryUpdated, cb),
  onScanStatus: (cb) => subscribe(IPC.scanStatus, cb),
  onSettingsChanged: (cb) => subscribe(IPC.settingsChanged, cb),
  onHotkeyStatus: (cb) => subscribe(IPC.hotkeyStatus, cb),
  onWindowVisibility: (cb) => subscribe(IPC.windowVisibility, cb),
  onContextAction: (cb) => subscribe(IPC.contextAction, cb),
  onOpenSettings: (cb) => subscribe(IPC.openSettings, () => cb())
}

contextBridge.exposeInMainWorld('launchbay', api)
