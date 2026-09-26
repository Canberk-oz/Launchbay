import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, libraryToCsv, libraryToJson } from '../src/main/library/exportFormat'
import type { Game } from '../src/shared/types'

const base: Game = {
  id: 'steam:620', platform: 'steam', platformId: '620', name: 'Portal 2', installPath: 'D:\\Steam\\steamapps\\common\\Portal 2',
  launchCommand: 'steam://run/620', coverImageUrl: null, coverFrame: 'art', coverBackground: null, coverAmbient: null, trailerUrl: null,
  trailerState: 'none', sizeOnDisk: 12_000_000_000, sizeStatus: 'known', playtimeMinutes: 754, isFavorite: true, favoritedAt: 1, lastPlayed: Date.UTC(2026, 8, 1),
  addedAt: Date.UTC(2024, 0, 2), tags: [], updateAvailable: false, isHidden: false
}
const xbox: Game = { ...base, id: 'xbox:Foo_8wek', platform: 'xbox', platformId: 'Foo_8wek', name: 'Forza "Horizon", 5', installPath: 'C:\\XboxGames\\Forza',
  launchCommand: 'shell:AppsFolder\\Foo_8wek!App', sizeOnDisk: null, sizeStatus: 'denied', playtimeMinutes: null, lastPlayed: null, addedAt: null, updateAvailable: null, isFavorite: false, isHidden: true }

test('export: CSV cells are quoted per RFC 4180 and never run as formulas', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a, b'), '"a, b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('two\nlines'), '"two\nlines"')
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(csvCell(-3), '-3') // numbers are data, not text
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(false), 'false')
})

test('export: CSV has a BOM, a header, CRLF rows sorted by name, and empty cells for unknowns', () => {
  const csv = libraryToCsv([xbox, base])
  assert.ok(csv.startsWith('\ufeffname,platform,platformId,id,installPath,launchCommand,sizeOnDiskBytes,sizeStatus,playtimeMinutes,lastPlayed,addedAt,updateAvailable,isFavorite,isHidden\r\n'))
  const lines = csv.slice(1).trimEnd().split('\r\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[1], 'Forza ""Horizon"", 5'.replace(/^/, '"') + '",xbox,Foo_8wek,xbox:Foo_8wek,C:\\XboxGames\\Forza,shell:AppsFolder\\Foo_8wek!App,,denied,,,,,false,true')
  assert.equal(lines[2], 'Portal 2,steam,620,steam:620,D:\\Steam\\steamapps\\common\\Portal 2,steam://run/620,12000000000,known,754,2026-09-01T00:00:00.000Z,2024-01-02T00:00:00.000Z,false,true,false')
})

test('export: JSON carries metadata and null (not false) for updates a store does not report', () => {
  const doc = JSON.parse(libraryToJson([base, xbox], { version: '0.1.0', exportedAt: Date.UTC(2026, 8, 26) }))
  assert.equal(doc.app, 'Launchbay')
  assert.equal(doc.count, 2)
  assert.equal(doc.exportedAt, '2026-09-26T00:00:00.000Z')
  assert.deepEqual(doc.games.map((g: { name: string }) => g.name), ['Forza "Horizon", 5', 'Portal 2'])
  assert.equal(doc.games[0].updateAvailable, null)
  assert.equal(doc.games[1].updateAvailable, false)
  assert.equal(doc.games[1].sizeOnDiskBytes, 12_000_000_000)
})
