import { isDirectory } from '../util/fsutil'
import { openShellAppsFolder } from './launchers'
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
    await openShellAppsFolder(game.launchCommand)
  },

  launchWatch(game) {
    return { dirs: [game.installPath] }
  },

  storePageUrl(game) {
    return `ms-windows-store://pdp/?PFN=${encodeURIComponent(game.platformId)}`
  }
}
