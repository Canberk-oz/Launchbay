import { httpGet } from '../util/http'
import { openProtocolUrl } from './launchers'
import { pickTrailer, scanSteam, type SteamMovie } from './steamScan'
import type { GameProvider } from './types'

export const steamProvider: GameProvider = {
  platform: 'steam',
  label: 'Steam',

  scan: scanSteam,

  async launch(game) {
    await openProtocolUrl(game.launchCommand, 'Steam')
  },

  async resolveTrailer(game) {
    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(game.platformId)}&filters=movies`
    const res = await httpGet(url, { timeoutMs: 15_000 })
    const body = (await res.json()) as Record<string, { success?: boolean; data?: { movies?: SteamMovie[] } } | undefined>
    const entry = body?.[game.platformId]
    // success:false means the store has no page for this app (delisted, region-locked, a tool).
    if (!entry?.success) return null
    return pickTrailer(entry.data?.movies)
  },

  launchWatch(game) {
    return { dirs: [game.installPath], steamAppId: game.platformId }
  },

  storePageUrl(game) {
    return /^\d+$/.test(game.platformId) ? `steam://store/${game.platformId}` : null
  }
}
