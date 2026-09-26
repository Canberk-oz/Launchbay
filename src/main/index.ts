import { app, BrowserWindow, globalShortcut, Menu, protocol } from 'electron'
import { join } from 'node:path'
import { acceleratorKeys } from '@shared/accelerator'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/types'
import { HotkeyManager } from './hotkey'
import { registerIpc } from './ipc'
import { LaunchService } from './launch'
import { LibraryService } from './library/library'
import { MEDIA_SCHEME, MediaService } from './library/media'
import { providerFor } from './providers'
import { SettingsStore } from './settings'
import { createTray, type AppTray } from './tray'
import { throttle } from './util/concurrency'
import { createLogger, initLogFile } from './util/log'
import { WindowManager } from './window'

const log = createLogger('app')

// Cached covers and trailers are served from disk over glmedia://. `stream`
// lets <video> make range requests against it.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const startHidden = process.argv.includes('--hidden')

// Lets tests and diagnostics run against a throwaway profile.
if (process.env.LAUNCHBAY_USER_DATA) app.setPath('userData', process.env.LAUNCHBAY_USER_DATA)

// Quit handling is wired before anything async, so a quit that arrives while
// the app is still starting (or a Windows shutdown) is never swallowed by
// close-to-tray, and pending writes are flushed exactly once.
let quitting = false
let flushed = false
const flushers: Array<() => Promise<void>> = []
const disposers: Array<() => void> = []

app.on('before-quit', () => {
  quitting = true
  for (const dispose of disposers) dispose()
})

app.on('will-quit', (event) => {
  if (app.isReady()) globalShortcut.unregisterAll()
  if (flushed) return
  event.preventDefault()
  flushed = true
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000))
  void Promise.race([Promise.all(flushers.map((flush) => flush().catch(() => undefined))), timeout]).finally(() =>
    app.quit()
  )
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.launchbay.app')
  void main()
}

async function main(): Promise<void> {
  await app.whenReady()
  // No menu bar, and none of its default accelerators (Ctrl+R reload, Ctrl+W close, zoom).
  Menu.setApplicationMenu(null)
  const root = app.getPath('userData')
  initLogFile(join(root, 'launchbay.log'))
  log.info(`Launchbay ${app.getVersion()} starting (Electron ${process.versions.electron})`)

  const settings = new SettingsStore(root)
  await settings.load()

  const media = new MediaService(join(root, 'media'), (game) => providerFor(game.platform))
  await media.init()
  protocol.handle(MEDIA_SCHEME, (request) => media.handle(request))

  const library = new LibraryService(root, media)
  await library.init()

  const launcher = new LaunchService(library)
  const windows = new WindowManager(root, {
    closeToTray: () => settings.get().closeToTray,
    isQuitting: () => quitting,
    onSessionEnd: () => {
      quitting = true
    }
  })
  const hotkeys = new HotkeyManager(() => windows.toggleOverlay())
  flushers.push(
    () => settings.flush(),
    () => library.flush(),
    () => media.flush(),
    () => windows.flush()
  )
  disposers.push(() => launcher.dispose())

  const send = (channel: string, payload?: unknown): void => {
    const win = windows.win
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  registerIpc({ library, media, settings, hotkeys, launcher, windows, isPackaged: app.isPackaged, startHidden })

  library.on(
    'changed',
    throttle(() => {
      const patch = library.drainChanges()
      if (patch) send(IPC.libraryPatch, patch)
    }, 150)
  )
  library.on('scan-status', (status) => send(IPC.scanStatus, status))
  settings.on('changed', (next: Settings, prev: Settings) => {
    send(IPC.settingsChanged, next)
    if (next.hotkeyEnabled !== prev.hotkeyEnabled) hotkeys.apply(next.hotkey, next.hotkeyEnabled)
    if (next.launchAtLogin !== prev.launchAtLogin) applyLoginItem(next.launchAtLogin)
  })

  let tray: AppTray | null = null
  hotkeys.on('status', (status) => {
    send(IPC.hotkeyStatus, status)
    tray?.setHotkeyHint(status.registered ? acceleratorKeys(status.accelerator).join('+') : null)
  })

  const initial = settings.get()
  hotkeys.apply(initial.hotkey, initial.hotkeyEnabled)
  applyLoginItem(initial.launchAtLogin)

  if (quitting) return // quit requested while starting up
  await windows.create({ show: !startHidden })

  tray = createTray({
    show: () => windows.showNormal(),
    refresh: () => void library.refresh({ manual: true }),
    openSettings: () => {
      windows.showNormal()
      send(IPC.openSettings)
    },
    quit: () => app.quit()
  })
  const status = hotkeys.getStatus()
  tray.setHotkeyHint(status.registered ? acceleratorKeys(status.accelerator).join('+') : null)

  app.on('second-instance', () => windows.showNormal())

  app.on('window-all-closed', () => {
    // Closing to tray hides the window instead, so reaching this means a real close.
    if (!settings.get().closeToTray) app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void windows.create({ show: true })
  })

  // The cached library is already on screen; refresh it in the background.
  void library.refresh({ manual: false })
}

function applyLoginItem(enabled: boolean): void {
  // In development the registered executable would be the bare Electron binary.
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
  } catch (err) {
    log.warn('could not update login item', err)
  }
}
