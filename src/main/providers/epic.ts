import { openProtocolUrl } from './launchers'
import { epicStorePageUrl, scanEpic } from './epicScan'
import type { GameProvider } from './types'

export const epicProvider: GameProvider = {
  platform: 'epic',
  label: 'Epic Games',

  scan: scanEpic,

  async launch(game) {
    await openProtocolUrl(game.launchCommand, 'The Epic Games Launcher')
  },

  launchWatch(game) {
    return { dirs: [game.installPath] }
  },

  storePageUrl: epicStorePageUrl,

  // The launcher has no documented uninstall link, so it opens on the library.
  uninstallHandoff(game) {
    return {
      url: 'com.epicgames.launcher://library',
      via: 'the Epic Games Launcher',
      steps: `The launcher opens on your library. Find ${game.name} there, open its ⋯ menu and choose Uninstall.`
    }
  }
}
