// Collections: user-made groups of games (stored as tags on each game).
// Shared by the main process (which validates what it stores) and the
// renderer (which offers the names and filters by them).

export const MAX_COLLECTION_NAME = 40
export const MAX_COLLECTIONS_PER_GAME = 20

/** A collection name as stored: trimmed, single spaces, no control characters, at most 40 characters. Null when empty. */
export function normalizeCollection(name: string): string | null {
  const clean = name
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COLLECTION_NAME)
    .trim()
  return clean || null
}

/** Collection names match regardless of case ("RPG" and "rpg" are one collection). */
export function sameCollection(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

/**
 * A clean, de-duplicated list for one game. Names matching one in `known`
 * (the library's existing collections) take its spelling, so "rpg" joins "RPG".
 */
export function cleanCollections(names: readonly string[], known: readonly string[] = []): string[] {
  const out: string[] = []
  for (const raw of names) {
    const name = normalizeCollection(raw)
    if (!name || out.some((n) => sameCollection(n, name))) continue
    out.push(known.find((k) => sameCollection(k, name)) ?? name)
    if (out.length === MAX_COLLECTIONS_PER_GAME) break
  }
  return out
}

export interface CollectionSummary {
  name: string
  /** Games in it that are not hidden. */
  count: number
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Every collection in use, alphabetically, with its visible game count. */
export function collectionsOf(games: ReadonlyArray<{ tags: readonly string[]; isHidden: boolean }>): CollectionSummary[] {
  const byKey = new Map<string, CollectionSummary>()
  for (const game of games) {
    for (const tag of game.tags) {
      const key = tag.toLocaleLowerCase()
      const entry = byKey.get(key) ?? { name: tag, count: 0 }
      if (!game.isHidden) entry.count++
      byKey.set(key, entry)
    }
  }
  return [...byKey.values()].sort((a, b) => collator.compare(a.name, b.name))
}
