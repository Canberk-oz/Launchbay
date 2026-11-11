import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCache, normalizeUserData } from '../src/main/library/cacheFormat'

const steam = {
  id: 'steam:400',
  platform: 'steam',
  platformId: '400',
  name: 'Portal',
  installPath: 'C:\\Steam\\steamapps\\common\\Portal',
  launchCommand: 'steam://run/400',
  sizeOnDisk: 4_000_000_000,
  playtimeMinutes: 120,
  lastPlayed: 1_700_000_000_000,
  updateAvailable: false,
  coverSources: [],
  lastScanned: 1
}

test('library cache: a good record survives unchanged', () => {
  const cache = normalizeCache({ version: 1, lastScanAt: 5, games: [steam] })
  assert.equal(cache.lastScanAt, 5)
  assert.deepEqual(cache.games, [steam])
})

test('library cache: records the app could not use are dropped, not passed on', () => {
  const cache = normalizeCache({
    lastScanAt: 'yesterday',
    games: [
      steam,
      { ...steam, platform: 'gog', id: 'gog:1' }, // a store this version has no provider for
      { ...steam, platformId: '401', name: 42 },
      { ...steam, platformId: '402', launchCommand: '' },
      { ...steam }, // the same game twice
      null,
      'steam:403'
    ]
  })
  assert.equal(cache.lastScanAt, null)
  assert.deepEqual(cache.games.map((g) => g.id), ['steam:400'])
})

test('library cache: odd field values become "unknown" instead of reaching the UI', () => {
  const [game] = normalizeCache({
    games: [{ ...steam, id: 'whatever', sizeOnDisk: '4 GB', playtimeMinutes: NaN, lastPlayed: undefined, updateAvailable: 'yes', coverSources: null }]
  }).games
  assert.equal(game.id, 'steam:400') // always derived, never trusted
  assert.equal(game.sizeOnDisk, null)
  assert.equal(game.playtimeMinutes, null)
  assert.equal(game.lastPlayed, null)
  assert.equal(game.updateAvailable, null)
  assert.deepEqual(game.coverSources, [])
})

test('library cache and user data: anything that is not the expected shape is an empty start', () => {
  for (const raw of [null, undefined, 7, 'x', [], { games: 'none' }]) {
    assert.deepEqual(normalizeCache(raw), { version: 1, lastScanAt: null, games: [] })
    assert.deepEqual(normalizeUserData(raw), { version: 1, games: {} })
  }
})

test('user data: keeps what is valid in each game and drops the rest', () => {
  const data = normalizeUserData({
    games: {
      'steam:400': { favorite: true, favoritedAt: 10, hidden: false, tags: ['Backlog', 7, '  '], trackedSeconds: '90', addedAt: 3 },
      'epic:A': { favorite: 'yes', lastPlayed: -1 },
      'xbox:B': ['not', 'an', 'object'],
      'xbox:C': { trackedSeconds: 600, hidden: true }
    }
  })
  assert.deepEqual(data.games, {
    'steam:400': { favorite: true, favoritedAt: 10, addedAt: 3, tags: ['Backlog'] },
    'xbox:C': { hidden: true, trackedSeconds: 600 }
  })
})
