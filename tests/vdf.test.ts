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
