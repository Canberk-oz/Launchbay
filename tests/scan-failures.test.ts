import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSteamPath, scanSteam } from '../src/main/providers/steamScan'
import { findEpicDataDir } from '../src/main/providers/epicScan'
import { scanXbox } from '../src/main/providers/xboxScan'

const broken = async (): Promise<never> => {
  throw new Error('PowerShell exited with code 1')
}
const registry = (values: Record<string, string | null>[]) => async () => values

test('scan contract: steam is "not installed" only when that is certain', async () => {
  const none = async () => false
  // The registry answered and nothing is there: not installed.
  assert.equal(await findSteamPath({ readRegistry: registry([{ SteamPath: null }, { InstallPath: null }]), isDirectory: none }), null)
  assert.deepEqual(await scanSteam({ readRegistry: registry([{ SteamPath: null }, { InstallPath: null }]), isDirectory: none }), [])
  // The registry failed and the default folder is absent: can't tell, so throw.
  await assert.rejects(findSteamPath({ readRegistry: broken, isDirectory: none }), /registry/)
  // The registry failed but the default folder exists: use it.
  const found = await findSteamPath({ readRegistry: broken, isDirectory: async (p) => p.toLowerCase().includes('program files (x86)') })
  assert.match(found ?? '', /Program Files \(x86\)[\\/]Steam$/)
})

test('scan contract: epic throws when its location cannot be read', async () => {
  const none = async () => false
  const env = { programData: 'C:\\ProgramData', isDirectory: none }
  assert.equal(await findEpicDataDir({ ...env, readRegistry: registry([{ AppDataPath: null }]) }), null)
  await assert.rejects(findEpicDataDir({ ...env, readRegistry: broken }), /registry/)
})

test('scan contract: xbox throws when the package list cannot be read, [] when it is empty', async () => {
  await assert.rejects(scanXbox(broken), /PowerShell/)
  assert.deepEqual(await scanXbox(async () => null), [])
  assert.deepEqual(await scanXbox(async () => []), [])
})
