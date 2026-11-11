// The games offered straight from the tray icon. Pure, so it is unit-tested under plain Node.

import type { Game } from '@shared/types'

export interface RecentEntry {
  id: string
  /** Menu text: the name, shortened, with "&" escaped so Windows doesn't read it as an accelerator. */
  label: string
}

const MAX_LABEL = 48

/** Pure: the most recently played games on the shelf, newest first. Hidden and never-played games are left out. */
export function recentGames(games: readonly Game[], limit = 5): RecentEntry[] {
  return games
    .filter((g) => !g.isHidden && g.lastPlayed !== null)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((g) => {
      const name = g.name.length > MAX_LABEL ? `${g.name.slice(0, MAX_LABEL - 1).trimEnd()}…` : g.name
      return { id: g.id, label: name.replace(/&/g, '&&') }
    })
}

/** Pure: whether two lists would draw the same menu. */
export function sameRecent(a: readonly RecentEntry[], b: readonly RecentEntry[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry.id === b[i].id && entry.label === b[i].label)
}
