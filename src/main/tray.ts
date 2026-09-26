import { Menu, nativeImage, Tray } from 'electron'
import { resourcePath } from './window'

export interface TrayActions {
  show(): void
  refresh(): void
  openSettings(): void
  quit(): void
}

export interface AppTray {
  tray: Tray
  /** Updates the tooltip, e.g. after the hotkey changes. */
  setHotkeyHint(label: string | null): void
}

export function createTray(actions: TrayActions): AppTray {
  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  const tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(resourcePath('icon.png')) : image)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Launchbay', click: actions.show },
      { label: 'Refresh library', click: actions.refresh },
      { label: 'Settings…', click: actions.openSettings },
      { type: 'separator' },
      { label: 'Quit Launchbay', click: actions.quit }
    ])
  )
  tray.on('click', actions.show)
  tray.setToolTip('Launchbay')
  return {
    tray,
    setHotkeyHint(label) {
      tray.setToolTip(label ? `Launchbay · ${label}` : 'Launchbay')
    }
  }
}
