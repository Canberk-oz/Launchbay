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

  storePageUrl: epicStorePageUrl
}
