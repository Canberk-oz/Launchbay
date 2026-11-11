// What Launchbay keeps on disk about the library (library.json: the last
// scan) and about the user (userdata.json: favorites, collections, tracked
// playtime), and how each file is read back. Both are read defensively: a
// hand-edited file, or one written by a newer or older version, must never
// stop the app from starting. Pure, so it is unit-tested under plain Node.

import { PLATFORMS } from '@shared/types'
import type { CoverSource, ScannedGame } from '../providers/types'

export interface StoredGame extends ScannedGame {
  id: string
  lastScanned: number
}

export interface LibraryCache {
  version: 1
  lastScanAt: number | null
  games: StoredGame[]
}

export interface UserGameState {
  favorite?: boolean
  favoritedAt?: number
  lastPlayed?: number
  hidden?: boolean
  /** Epoch ms the game arrived on this PC; cleared when a successful scan no longer finds it. */
  addedAt?: number
  /** Collections the game is in. Kept when the game is uninstalled, like favorites. */
  tags?: string[]
  /** Playtime Launchbay measured from sessions it saw (seconds), separate from any store figure. */
  trackedSeconds?: number
}

export interface UserData {
  version: 1
  games: Record<string, UserGameState>
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const numberOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A cached game the rest of the app can rely on, or null when the record is unusable. */
function storedGame(raw: unknown): StoredGame | null {
  if (!isRecord(raw)) return null
  const { platform, platformId, name, installPath, launchCommand } = raw
  // A store this version doesn't know (a newer cache) has no provider to hand the game to.
  if (!PLATFORMS.some((p) => p === platform)) return null
  if (!text(platformId) || !text(name) || !text(installPath) || !text(launchCommand)) return null
  const game = raw as unknown as StoredGame
  return {
    ...game,
    id: `${game.platform}:${game.platformId}`,
    lastScanned: numberOrNull(raw.lastScanned) ?? 0,
    sizeOnDisk: numberOrNull(raw.sizeOnDisk),
    playtimeMinutes: numberOrNull(raw.playtimeMinutes),
    lastPlayed: numberOrNull(raw.lastPlayed),
    // Caches written before this field existed have no value: unknown until the next scan.
    updateAvailable: typeof raw.updateAvailable === 'boolean' ? raw.updateAvailable : null,
    coverSources: Array.isArray(raw.coverSources) ? (raw.coverSources as CoverSource[]) : []
  }
}

export function normalizeCache(raw: unknown): LibraryCache {
  const r = isRecord(raw) ? raw : {}
  const games: StoredGame[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(r.games) ? r.games : []) {
    const game = storedGame(entry)
    if (!game || seen.has(game.id)) continue
    seen.add(game.id)
    games.push(game)
  }
  return { version: 1, lastScanAt: numberOrNull(r.lastScanAt), games }
}

function userGameState(raw: unknown): UserGameState | null {
  if (!isRecord(raw)) return null
  const state: UserGameState = {}
  if (raw.favorite === true) state.favorite = true
  if (raw.hidden === true) state.hidden = true
  for (const key of ['favoritedAt', 'lastPlayed', 'addedAt', 'trackedSeconds'] as const) {
    const value = numberOrNull(raw[key])
    if (value !== null && value > 0) state[key] = value
  }
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    if (tags.length) state.tags = tags
  }
  return Object.keys(state).length ? state : null
}

export function normalizeUserData(raw: unknown): UserData {
  const games: Record<string, UserGameState> = {}
  const source = isRecord(raw) && isRecord(raw.games) ? raw.games : {}
  for (const [id, entry] of Object.entries(source)) {
    const state = userGameState(entry)
    if (state) games[id] = state
  }
  return { version: 1, games }
}
