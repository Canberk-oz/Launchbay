import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import type { RecentEntry } from './recent'
import { resourcePath } from './window'

export interface TrayActions {
  show(): void
  refresh(): void
  openSettings(): void
  quit(): void
  /** Starts a game picked from the recent list. */
  launch(id: string): void
}

export interface AppTray {
  tray: Tray
  /** Updates the tooltip, e.g. after the hotkey changes. */
  setHotkeyHint(label: string | null): void
  /** The recently played games listed at the top of the menu. */
  setRecent(games: readonly RecentEntry[]): void
}

export function createTray(actions: TrayActions): AppTray {
  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  const tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(resourcePath('icon.png')) : image)
  const build = (recent: readonly RecentEntry[]): void => {
    const played: MenuItemConstructorOptions[] = recent.length
      ? [
          { label: 'Recently played', enabled: false },
          ...recent.map((game): MenuItemConstructorOptions => ({ label: game.label, click: () => actions.launch(game.id) })),
          { type: 'separator' }
        ]
      : []
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...played,
        { label: 'Open Launchbay', click: actions.show },
        { label: 'Refresh library', click: actions.refresh },
        { label: 'Settings…', click: actions.openSettings },
        { type: 'separator' },
        { label: 'Quit Launchbay', click: actions.quit }
      ])
    )
  }
  build([])
  tray.on('click', actions.show)
  tray.setToolTip('Launchbay')
  return {
    tray,
    setHotkeyHint(label) {
      tray.setToolTip(label ? `Launchbay · ${label}` : 'Launchbay')
    },
    setRecent: build
  }
}
