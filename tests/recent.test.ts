import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recentGames, sameRecent } from '../src/main/recent'
import type { Game } from '../src/shared/types'

const game = (id: string, name: string, lastPlayed: number | null, isHidden = false): Game => ({
  id, platform: 'steam', platformId: id, name, installPath: 'C:\\g', launchCommand: 'steam://run/1', coverImageUrl: null, coverFrame: 'art',
  coverBackground: null, coverAmbient: null, trailerUrl: null, trailerState: 'none', sizeOnDisk: null, sizeStatus: 'unreported', playtimeMinutes: null,
  trackedMinutes: null, isRunning: false, isFavorite: false, favoritedAt: null, lastPlayed, addedAt: null, tags: [], updateAvailable: null, isHidden
})

test('tray: recent games are the last played, newest first, without hidden or never-played ones', () => {
  const games = [
    game('a', 'Alpha', 100),
    game('b', 'Beta', null),
    game('c', 'Gamma', 300, true),
    game('d', 'Delta', 200),
    game('e', 'Epsilon', 200),
    game('f', 'Zeta', 50)
  ]
  assert.deepEqual(recentGames(games, 3).map((g) => g.id), ['d', 'e', 'a'])
  assert.deepEqual(recentGames([game('b', 'Beta', null)]), [])
})

test('tray: labels are safe menu text', () => {
  const [amp, long] = recentGames([game('a', 'Ratchet & Clank', 2), game('b', 'x'.repeat(80), 1)])
  assert.equal(amp.label, 'Ratchet && Clank') // a lone & would underline the next letter
  assert.equal(long.label.length, 48)
  assert.ok(long.label.endsWith('…'))
})

test('tray: the menu is rebuilt only when the list would look different', () => {
  const a = recentGames([game('a', 'Alpha', 2), game('b', 'Beta', 1)])
  assert.equal(sameRecent(a, recentGames([game('b', 'Beta', 1), game('a', 'Alpha', 5)])), true) // same order
  assert.equal(sameRecent(a, recentGames([game('a', 'Alpha', 1), game('b', 'Beta', 2)])), false) // order changed
  assert.equal(sameRecent(a, recentGames([game('a', 'Alpha II', 2), game('b', 'Beta', 1)])), false) // renamed
  assert.equal(sameRecent(a, []), false)
})
