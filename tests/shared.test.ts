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
    trailerUrl: null,
    trailerState: 'none',
    sizeOnDisk: null,
    playtimeMinutes: null,
    isFavorite: false,
    favoritedAt: null,
    lastPlayed: null,
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
  const all = buildSections(games, { search: '', platform: 'all', sort: 'name' })
  assert.deepEqual(all.map((s) => s.title), ['Favorites', 'All games'])
  assert.deepEqual(all[0].games.map((g) => g.name), ['Forager', 'Hollow Knight']) // newest favorite first
  assert.deepEqual(all[1].games.map((g) => g.name), ['Forager', 'Hollow Knight', 'Portal'])

  const steam = buildSections(games, { search: '', platform: 'steam', sort: 'recent' })
  assert.deepEqual(steam[0].games.map((g) => g.name), ['Hollow Knight'])
  assert.deepEqual(steam[1].games.map((g) => g.name), ['Hollow Knight', 'Portal'])

  const found = buildSections(games, { search: 'KNİGHT', platform: 'all', sort: 'name' })
  assert.deepEqual(found.map((s) => s.title), ['Results'])
  assert.equal(searchKey('Çağrı ı'), 'cagri i')
  assert.deepEqual(buildSections(games, { search: 'zzz', platform: 'all', sort: 'name' }), [])
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
