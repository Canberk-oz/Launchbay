import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVdf, vdfGet, vdfPath, vdfString } from '../src/main/util/vdf'
import { isPlayableManifest, parseAppManifest, parseLibraryFolders } from '../src/main/providers/steamScan'

test('parses nested KeyValues with escapes and comments', () => {
  const doc = parseVdf(`\ufeff"root"
  {
    // a comment
    "path"   "C:\\\\Program Files (x86)\\\\Steam"
    "quote"  "say \\"hi\\""
    "raw"    "D:\\SteamLibrary"
    "child" { "k" "v" }
    bare token
  }`)
  assert.equal(vdfString(vdfGet(doc, 'root'), 'path'), 'C:\\Program Files (x86)\\Steam')
  assert.equal(vdfString(vdfGet(doc, 'root'), 'quote'), 'say "hi"')
  // Unescaped backslashes in older files survive as-is.
  assert.equal(vdfString(vdfGet(doc, 'root'), 'raw'), 'D:\\SteamLibrary')
  assert.equal(vdfPath(doc, 'ROOT', 'Child', 'K'), 'v')
  assert.equal(vdfString(vdfGet(doc, 'root'), 'bare'), 'token')
})

test('reads both libraryfolders.vdf formats', () => {
  const modern = `"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "400" "1" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`
  assert.deepEqual(parseLibraryFolders(modern), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])

  const legacy = `"LibraryFolders"
{
  "TimeNextStatsReport" "1690000000"
  "ContentStatsID" "-123"
  "1" "E:\\\\Games\\\\Steam"
}`
  assert.deepEqual(parseLibraryFolders(legacy), ['E:\\Games\\Steam'])
})

test('reads an appmanifest and filters non-games', () => {
  const acf = `"AppState"
{
  "appid" "367520"
  "name" "Hollow Knight"
  "StateFlags" "4"
  "installdir" "Hollow Knight"
  "LastPlayed" "1790111632"
  "SizeOnDisk" "5231995691"
  "buildid" "22529139"
}`
  const m = parseAppManifest(acf)
  assert.ok(m)
  assert.equal(m.appid, '367520')
  assert.equal(m.name, 'Hollow Knight')
  assert.equal(m.sizeOnDisk, 5231995691)
  assert.equal(m.lastPlayed, 1790111632000)
  assert.equal(isPlayableManifest(m), true)

  assert.equal(isPlayableManifest({ ...m, appid: '228980', name: 'Steamworks Common Redistributables' }), false)
  assert.equal(isPlayableManifest({ ...m, name: 'Proton Experimental' }), false)
  // Updating (flags without FullyInstalled) but previously installed: still listed.
  assert.equal(isPlayableManifest({ ...m, stateFlags: 1026 }), true)
  // First download in progress: not listed yet.
  assert.equal(isPlayableManifest({ ...m, stateFlags: 1026, buildid: '0' }), false)
  assert.equal(isPlayableManifest({ ...m, stateFlags: 4 | 2048 }), false)
})

test('steam: StateFlags UpdateRequired (2) marks a pending update', async () => {
  const { hasPendingUpdate, parseAppManifest } = await import('../src/main/providers/steamScan')
  const acf = (flags: number) => `"AppState" { "appid" "620" "name" "Portal 2" "installdir" "Portal 2" "StateFlags" "${flags}" "buildid" "1" }`
  assert.equal(hasPendingUpdate(parseAppManifest(acf(4))!), false) // fully installed
  assert.equal(hasPendingUpdate(parseAppManifest(acf(6))!), true) // installed + update required
  assert.equal(hasPendingUpdate(parseAppManifest(acf(1030))!), true) // + update started
})

test('steam: screenshots from every local user, newest first, with Steam thumbnails when present', async () => {
  const { findScreenshots } = await import('../src/main/providers/steamScan')
  const { mkdtempSync, mkdirSync, writeFileSync, utimesSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const steam = mkdtempSync(join(tmpdir(), 'lb-steam-'))
  const shots = (user: string) => join(steam, 'userdata', user, '760', 'remote', '620', 'screenshots')
  mkdirSync(join(shots('111'), 'thumbnails'), { recursive: true })
  mkdirSync(shots('222'), { recursive: true })
  const put = (dir: string, name: string, at: number) => {
    writeFileSync(join(dir, name), 'x')
    utimesSync(join(dir, name), at, at)
  }
  put(shots('111'), '20240101_1.jpg', 1_700_000_000)
  put(join(shots('111'), 'thumbnails'), '20240101_1.jpg', 1_700_000_000)
  put(shots('222'), '20250101_1.png', 1_800_000_000)
  put(shots('222'), 'notes.txt', 1_900_000_000) // not an image
  mkdirSync(join(steam, 'userdata', 'anonymous'), { recursive: true }) // not an account folder

  const found = await findScreenshots(steam, '620')
  assert.deepEqual(found.map((s) => [s.path.slice(steam.length), !!s.thumbnail]), [
    [join('/userdata/222/760/remote/620/screenshots/20250101_1.png'), false],
    [join('/userdata/111/760/remote/620/screenshots/20240101_1.jpg'), true]
  ])
  assert.deepEqual(await findScreenshots(steam, '999'), [])
  assert.deepEqual(await findScreenshots(steam, '../x'), [])
})
