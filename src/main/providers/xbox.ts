import { isDirectory } from '../util/fsutil'
import { openShellAppsFolder, STALE_COMMAND } from './launchers'
import { scanXbox } from './xboxScan'
import type { GameProvider } from './types'

export const xboxProvider: GameProvider = {
  platform: 'xbox',
  label: 'Xbox',

  scan: scanXbox,

  async launch(game) {
    if (!(await isDirectory(game.installPath))) {
      throw new Error('This game is no longer installed. Refresh the library to update it.')
    }
    // Explorer opens whatever it is given; only ever give it a packaged app.
    if (!/^shell:AppsFolder\\[^\s"\\/]+$/i.test(game.launchCommand)) throw new Error(STALE_COMMAND)
    await openShellAppsFolder(game.launchCommand)
  },

  launchWatch(game) {
    return { dirs: [game.installPath] }
  },

  uninstallHandoff(game) {
    return {
      url: 'ms-settings:appsfeatures',
      via: 'Windows Settings',
      steps: `Settings opens on Installed apps. Find ${game.name} there, open its ⋯ menu and choose Uninstall.`
    }
  },

  storePageUrl(game) {
    return `ms-windows-store://pdp/?PFN=${encodeURIComponent(game.platformId)}`
  }
}
