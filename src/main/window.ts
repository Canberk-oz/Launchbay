import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { WindowVisibility } from '@shared/types'
import { JsonStore } from './util/fsutil'

const BACKGROUND = '#0d0d0f'
const TITLE_BAR_HEIGHT = 44
const SHOW_MS = 170
const HIDE_MS = 140

interface WindowState {
  bounds: Rectangle | null
  maximized: boolean
}

export function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}

function visibleOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const x = Math.max(a.x, bounds.x)
    const y = Math.max(a.y, bounds.y)
    const w = Math.min(a.x + a.width, bounds.x + bounds.width) - x
    const h = Math.min(a.y + a.height, bounds.y + bounds.height) - y
    return w >= 120 && h >= 80
  })
}

/**
 * The single library window. It doubles as the overlay: the global hotkey
 * shows it centered and always-on-top with a quick fade and scale, and hides
 * it the same way. The renderer plays the scale half of the animation when it
 * receives `window:visibility`.
 */
export interface WindowPolicy {
  closeToTray(): boolean
  isQuitting(): boolean
  /** Windows is logging off or shutting down; closing must not be blocked. */
  onSessionEnd(): void
}

export class WindowManager {
  win: BrowserWindow | null = null
  private overlay = false
  private fadeCancel: (() => void) | null = null
  private readonly state: JsonStore<WindowState>
  private readonly policy: WindowPolicy

  constructor(root: string, policy: WindowPolicy) {
    this.state = new JsonStore<WindowState>(join(root, 'window.json'), { bounds: null, maximized: false })
    this.policy = policy
  }

  async create(opts: { show: boolean }): Promise<BrowserWindow> {
    await this.state.load((raw) => {
      const r = raw as Partial<WindowState> | null
      return { bounds: r?.bounds ?? null, maximized: !!r?.maximized }
    })
    const saved = this.state.data.bounds
    const bounds = saved && visibleOnSomeDisplay(saved) ? saved : null

    const win = new BrowserWindow({
      width: bounds?.width ?? 1280,
      height: bounds?.height ?? 820,
      x: bounds?.x,
      y: bounds?.y,
      minWidth: 720,
      minHeight: 500,
      show: false,
      title: 'Launchbay',
      icon: resourcePath('icon.png'),
      backgroundColor: BACKGROUND,
      titleBarStyle: 'hidden',
      // Transparent, so the caption buttons float over whatever is beneath them
      // (the settings sheet, the launch transition) instead of a solid block.
      titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '#a7a7ae', height: TITLE_BAR_HEIGHT },
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        // Keep the renderer responsive while hidden in the tray so the overlay opens instantly.
        backgroundThrottling: false
      }
    })
    this.win = win
    if (this.state.data.maximized) win.maximize()

    win.once('ready-to-show', () => {
      if (opts.show) win.show()
    })

    win.on('close', (event) => {
      if (!this.policy.isQuitting() && this.policy.closeToTray()) {
        event.preventDefault()
        void this.hide()
      }
    })
    win.on('query-session-end', () => this.policy.onSessionEnd())
    win.on('session-end', () => this.policy.onSessionEnd())
    win.on('blur', () => {
      // An overlay that loses focus stops floating above everything else.
      if (this.overlay && !win.isDestroyed()) {
        win.setAlwaysOnTop(false)
        this.overlay = false
      }
    })
    const remember = (): void => {
      if (win.isDestroyed() || win.isMinimized()) return
      this.state.data.maximized = win.isMaximized()
      if (!win.isMaximized() && !win.isFullScreen()) this.state.data.bounds = win.getBounds()
      this.state.save()
    }
    win.on('resize', remember)
    win.on('move', remember)
    win.on('maximize', remember)
    win.on('unmaximize', remember)

    // With the application menu removed, keep DevTools reachable in development.
    if (!app.isPackaged) {
      win.webContents.on('before-input-event', (_event, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
          win.webContents.toggleDevTools()
        }
      })
    }

    // Links never navigate the app window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== win.webContents.getURL()) event.preventDefault()
    })

    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      await win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await win.loadFile(join(__dirname, '../renderer/index.html'))
    }
    return win
  }

  async flush(): Promise<void> {
    await this.state.flush()
  }

  private send(visibility: WindowVisibility): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(IPC.windowVisibility, visibility)
  }

  private fade(from: number, to: number, ms: number): Promise<void> {
    const win = this.win
    if (!win) return Promise.resolve()
    this.fadeCancel?.()
    return new Promise((resolve) => {
      const start = Date.now()
      win.setOpacity(from)
      const timer = setInterval(() => {
        if (win.isDestroyed()) return finish()
        const t = Math.min(1, (Date.now() - start) / ms)
        win.setOpacity(from + (to - from) * (1 - Math.pow(1 - t, 3)))
        if (t >= 1) finish()
      }, 8)
      const finish = (): void => {
        clearInterval(timer)
        this.fadeCancel = null
        resolve()
      }
      this.fadeCancel = finish
    })
  }

  /** Normal (non-overlay) show, e.g. from the tray icon. */
  showNormal(): void {
    const win = this.win
    if (!win) return
    this.fadeCancel?.()
    this.overlay = false
    win.setAlwaysOnTop(false)
    win.setOpacity(1)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    this.send('show')
  }

  toggleOverlay(): void {
    const win = this.win
    if (!win) return
    if (win.isVisible() && !win.isMinimized() && win.isFocused()) void this.hide()
    else void this.showOverlay()
  }

  async showOverlay(): Promise<void> {
    const win = this.win
    if (!win) return
    const alreadyVisible = win.isVisible() && !win.isMinimized()
    this.overlay = true
    if (!alreadyVisible) {
      win.setOpacity(0)
      if (win.isMinimized()) win.restore()
      if (!win.isMaximized()) this.centerOnCursorDisplay()
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    win.show()
    win.focus()
    win.moveTop()
    this.send('overlay')
    if (!alreadyVisible) await this.fade(0, 1, SHOW_MS)
  }

  async hide(): Promise<void> {
    const win = this.win
    if (!win || !win.isVisible()) return
    this.send('hide')
    await this.fade(win.getOpacity(), 0, HIDE_MS)
    if (win.isDestroyed()) return
    win.hide()
    win.setOpacity(1)
    win.setAlwaysOnTop(false)
    this.overlay = false
  }

  private centerOnCursorDisplay(): void {
    const win = this.win
    if (!win) return
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { width, height } = win.getBounds()
    const w = Math.min(width, workArea.width - 48)
    const h = Math.min(height, workArea.height - 48)
    win.setBounds({
      x: Math.round(workArea.x + (workArea.width - w) / 2),
      y: Math.round(workArea.y + (workArea.height - h) / 2),
      width: w,
      height: h
    })
  }
}
