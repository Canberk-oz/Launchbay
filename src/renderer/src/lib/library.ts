import { PLATFORM_LABELS, type Game, type Platform, type SortMode } from '@shared/types'

export type PlatformFilter = 'all' | Platform

export interface Section {
  key: 'favorites' | 'library'
  title: string
  games: Game[]
}

/** Case-, accent- and dotless-i-insensitive search key. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareGames(a: Game, b: Game, mode: SortMode): number {
  if (mode === 'recent') {
    const d = (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
    if (d !== 0) return d
  } else if (mode === 'size') {
    const d = (b.sizeOnDisk ?? -1) - (a.sizeOnDisk ?? -1)
    if (d !== 0) return d
  }
  return collator.compare(a.name, b.name) || a.platform.localeCompare(b.platform)
}

export function platformCounts(games: Game[]): Record<PlatformFilter, number> {
  const counts: Record<PlatformFilter, number> = { all: 0, steam: 0, epic: 0, xbox: 0 }
  for (const g of games) {
    if (g.isHidden) continue
    counts.all++
    counts[g.platform]++
  }
  return counts
}

/**
 * Favorites are pinned above the full library (both respect the platform
 * filter). While searching there is a single results section instead, so a
 * match never appears twice.
 */
export function buildSections(games: Game[], opts: { search: string; platform: PlatformFilter; sort: SortMode }): Section[] {
  const query = searchKey(opts.search.trim())
  const visible = games.filter(
    (g) => !g.isHidden && (opts.platform === 'all' || g.platform === opts.platform) && (!query || searchKey(g.name).includes(query))
  )
  const sorted = [...visible].sort((a, b) => compareGames(a, b, opts.sort))
  if (query) return sorted.length ? [{ key: 'library', title: 'Results', games: sorted }] : []

  const favorites = visible
    .filter((g) => g.isFavorite)
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0) || collator.compare(a.name, b.name))
  const title = opts.platform === 'all' ? 'All games' : `${PLATFORM_LABELS[opts.platform]} games`
  const sections: Section[] = []
  if (favorites.length) sections.push({ key: 'favorites', title: 'Favorites', games: favorites })
  if (sorted.length) sections.push({ key: 'library', title, games: sorted })
  return sections
}
