import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceleratorFromEvent, acceleratorKeys, isValidAccelerator } from '../src/shared/accelerator'
import { buildSections, searchKey } from '../src/renderer/src/lib/library'
import { imageExtension, imageSizeFromBuffer } from '../src/main/util/imageSize'
import type { Game } from '../src/shared/types'

test('accelerators: only combinations that are safe as global shortcuts', () => {
  assert.equal(isValidAccelerator('CommandOrControl+Shift+G'), true)
  assert.equal(isValidAccelerator('Alt+F1'), true)
  assert.equal(isValidAccelerator('F9'), true) // function keys may stand alone
  assert.equal(isValidAccelerator('Super+Space'), true)
  assert.equal(isValidAccelerator('Shift+G'), false) // would eat capital G everywhere
  assert.equal(isValidAccelerator('G'), false)
  assert.equal(isValidAccelerator('Ctrl+Shift'), false)
  assert.equal(isValidAccelerator('Ctrl+Nope'), false)
  assert.equal(isValidAccelerator(''), false)
})

test('accelerators: recorded by physical key, labelled for keycaps', () => {
  const base = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }
  assert.equal(acceleratorFromEvent({ ...base, code: 'KeyG', ctrlKey: true, shiftKey: true }), 'CommandOrControl+Shift+G')
  assert.equal(acceleratorFromEvent({ ...base, code: 'Digit5', altKey: true }), 'Alt+5')
  assert.equal(acceleratorFromEvent({ ...base, code: 'ArrowUp', metaKey: true }), 'Super+Up')
  assert.equal(acceleratorFromEvent({ ...base, code: 'ShiftLeft', shiftKey: true }), null)
  assert.deepEqual(acceleratorKeys('CommandOrControl+Shift+G'), ['Ctrl', 'Shift', 'G'])
  assert.deepEqual(acceleratorKeys('Super+Up'), ['Win', '↑'])
})

function game(partial: Partial<Game>): Game {
  return {
    id: `${partial.platform ?? 'steam'}:${partial.name}`,
    platform: 'steam',
    platformId: partial.name ?? '',
    name: '',
    installPath: '',
    launchCommand: '',
    coverImageUrl: null,
    coverFrame: 'art',
    coverBackground: null,
    coverAmbient: null,
    trailerUrl: null,
    trailerState: 'none',
    sizeOnDisk: null,
    sizeStatus: 'unreported',
    playtimeMinutes: null,
    isFavorite: false,
    favoritedAt: null,
    lastPlayed: null,
    addedAt: null,
    tags: [],
    updateAvailable: null,
    isHidden: false,
    ...partial
  }
}

test('sections: favorites pinned above the library, filtered by platform, merged while searching', () => {
  const games = [
    game({ name: 'Portal', lastPlayed: 3 }),
    game({ name: 'Hollow Knight', isFavorite: true, favoritedAt: 10, lastPlayed: 5 }),
    game({ name: 'Forager', platform: 'xbox', isFavorite: true, favoritedAt: 20 }),
    game({ name: 'Hidden One', isHidden: true })
  ]
  const all = buildSections(games, { search: '', filter: 'all', sort: 'name' })
  assert.deepEqual(all.map((s) => s.title), ['Favorites', 'All games'])
  assert.deepEqual(all[0].games.map((g) => g.name), ['Forager', 'Hollow Knight']) // newest favorite first
  assert.deepEqual(all[1].games.map((g) => g.name), ['Forager', 'Hollow Knight', 'Portal'])

  const steam = buildSections(games, { search: '', filter: 'steam', sort: 'recent' })
  assert.deepEqual(steam[0].games.map((g) => g.name), ['Hollow Knight'])
  assert.deepEqual(steam[1].games.map((g) => g.name), ['Hollow Knight', 'Portal'])

  const found = buildSections(games, { search: 'KNİGHT', filter: 'all', sort: 'name' })
  assert.deepEqual(found.map((s) => s.title), ['Results'])
  assert.equal(searchKey('Çağrı ı'), 'cagri i')
  assert.deepEqual(buildSections(games, { search: 'zzz', filter: 'all', sort: 'name' }), [])
})

test('image sniffing', () => {
  const png = Buffer.alloc(32)
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(600, 16)
  png.writeUInt32BE(900, 20)
  assert.deepEqual(imageSizeFromBuffer(png), { width: 600, height: 900 })
  assert.equal(imageExtension(png), 'png')
  assert.equal(imageExtension(Buffer.from('<!doctype html><html>')), null)
})

test('library patches: upsert, add and remove by id, leaving untouched games as they were', async () => {
  const { applyLibraryPatch } = await import('../src/renderer/src/lib/library')
  const a = game({ name: 'A' })
  const b = game({ name: 'B' })
  const c = game({ name: 'C' })
  const games = [a, b, c]
  const b2 = { ...b, isFavorite: true }
  const d = game({ name: 'D' })
  const next = applyLibraryPatch(games, { upsert: [b2, d], remove: [c.id] })
  assert.deepEqual(next.map((g) => g.name), ['A', 'B', 'D'])
  assert.equal(next[0], a) // same object: a memoized tile skips re-rendering
  assert.equal(next[1], b2)
  assert.equal(applyLibraryPatch(games, { upsert: [], remove: [] }), games)
  assert.deepEqual(applyLibraryPatch(games, { upsert: [], remove: ['nope'] }).length, 3)
})

test('addedAt: an install folder creation time when believable, otherwise now', async () => {
  const { addedAtFrom } = await import('../src/main/library/addedAt')
  const now = Date.UTC(2026, 8, 26)
  const installed = Date.UTC(2024, 2, 1)
  assert.equal(addedAtFrom(installed, now), installed)
  assert.equal(addedAtFrom(null, now), now) // stat failed
  assert.equal(addedAtFrom(0, now), now) // filesystem without creation times
  assert.equal(addedAtFrom(now + 60_000, now), now) // clock skew: never in the future
  assert.equal(addedAtFrom(Number.NaN, now), now)
})

test('sections: "Recently added" puts the newest arrivals first, undated games last', () => {
  const games = [
    game({ name: 'Old', addedAt: 100 }),
    game({ name: 'Undated', addedAt: null }),
    game({ name: 'New', addedAt: 300 }),
    game({ name: 'Mid', addedAt: 200 })
  ]
  const [all] = buildSections(games, { search: '', filter: 'all', sort: 'added' })
  assert.deepEqual(all.games.map((g) => g.name), ['New', 'Mid', 'Old', 'Undated'])
})

test('disk usage: totals by store and drive keep unknown and measuring counts beside the bytes', async () => {
  const { diskUsage, driveOf } = await import('../src/renderer/src/lib/diskUsage')
  assert.equal(driveOf('d:\\SteamLibrary\\steamapps\\common\\Portal 2'), 'D:')
  assert.equal(driveOf('\\\\nas\\games\\Foo'), '\\\\nas\\games')
  assert.equal(driveOf('/home/me/games'), '/')

  const games = [
    game({ name: 'Big', installPath: 'D:\\Steam\\Big', sizeOnDisk: 100, sizeStatus: 'known' }),
    game({ name: 'Small', installPath: 'C:\\Steam\\Small', sizeOnDisk: 10, sizeStatus: 'known', isHidden: true }),
    game({ name: 'Halo', platform: 'xbox', installPath: 'C:\\XboxGames\\Halo', sizeStatus: 'denied' }),
    game({ name: 'Forza', platform: 'xbox', installPath: 'D:\\XboxGames\\Forza', sizeStatus: 'measuring' }),
    game({ name: 'Alan', platform: 'epic', installPath: 'E:\\Epic\\Alan', sizeOnDisk: 50, sizeStatus: 'known' })
  ]
  const u = diskUsage(games)
  assert.deepEqual(
    { bytes: u.total.bytes, games: u.total.games, known: u.total.known, unknown: u.total.unknown, measuring: u.total.measuring },
    { bytes: 160, games: 5, known: 3, unknown: 1, measuring: 1 } // the hidden game counts: it still takes space
  )
  assert.deepEqual(u.byPlatform.map((g) => [g.key, g.bytes, g.unknown, g.measuring]), [['steam', 110, 0, 0], ['epic', 50, 0, 0], ['xbox', 0, 1, 1]])
  assert.deepEqual(u.byDrive.map((g) => [g.key, g.bytes, g.games]), [['D:', 100, 2], ['E:', 50, 1], ['C:', 10, 2]])
  assert.deepEqual(u.largest.map((g) => g.name), ['Big', 'Alan', 'Small'])
  assert.deepEqual(u.unknown.map((g) => g.name), ['Halo']) // measuring is not "unknown" yet
})

test('collections: names are cleaned, matched regardless of case, and take the existing spelling', async () => {
  const { cleanCollections, collectionsOf, normalizeCollection } = await import('../src/shared/collections')
  assert.equal(normalizeCollection('  Co-op \t with   friends \n'), 'Co-op with friends')
  assert.equal(normalizeCollection('   '), null)
  assert.equal(normalizeCollection('x'.repeat(60))?.length, 40)
  assert.deepEqual(cleanCollections(['rpg', 'RPG', ' Couch ', ''], ['RPG']), ['RPG', 'Couch'])
  assert.deepEqual(
    collectionsOf([
      { tags: ['RPG', 'Couch'], isHidden: false },
      { tags: ['rpg'], isHidden: true },
      { tags: ['Backlog'], isHidden: false }
    ]),
    [{ name: 'Backlog', count: 1 }, { name: 'Couch', count: 1 }, { name: 'RPG', count: 1 }] // hidden games don't count
  )
})

test('sections: a collection filter shows its games under the collection name', async () => {
  const { collectionFilter } = await import('../src/renderer/src/lib/library')
  const games = [
    game({ name: 'Hades', tags: ['Roguelikes'] }),
    game({ name: 'Dead Cells', platform: 'epic', tags: ['roguelikes', 'Couch'] }),
    game({ name: 'Portal', tags: [] })
  ]
  const [section] = buildSections(games, { search: '', filter: collectionFilter('Roguelikes'), sort: 'name' })
  assert.equal(section.title, 'Roguelikes')
  assert.deepEqual(section.games.map((g) => g.name), ['Dead Cells', 'Hades'])
})
