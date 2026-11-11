import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { measureFolder, SizeService, type WalkIo } from '../src/main/library/sizes'

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'lb-size-'))
  mkdirSync(join(root, 'Content', 'Data'), { recursive: true })
  writeFileSync(join(root, 'game.exe'), Buffer.alloc(1000))
  writeFileSync(join(root, 'Content', 'a.pak'), Buffer.alloc(2500))
  writeFileSync(join(root, 'Content', 'Data', 'b.bin'), Buffer.alloc(500))
  const outside = mkdtempSync(join(tmpdir(), 'lb-outside-'))
  writeFileSync(join(outside, 'huge.bin'), Buffer.alloc(9999))
  symlinkSync(outside, join(root, 'link')) // links are not followed
  return root
}

const denyUnder = (fragment: string): WalkIo => ({
  readdir: async (p) => {
    if (p.includes(fragment)) throw Object.assign(new Error(`EPERM: operation not permitted, scandir '${p}'`), { code: 'EPERM' })
    return fs.readdir(p, { withFileTypes: true })
  },
  lstat: (p) => fs.lstat(p)
})

test('sizes: a walk adds up every file and does not follow links', async () => {
  assert.deepEqual(await measureFolder(tree()), { status: 'ok', bytes: 4000 })
})

test('sizes: any access denial means "unknown", never a partial total', async () => {
  const result = await measureFolder(tree(), denyUnder('Data'))
  assert.equal(result.status, 'denied')
  assert.equal((await measureFolder(join(tmpdir(), 'lb-does-not-exist'))).status, 'failed')
})

test('sizes: measured once per package version, denials cached, failures retried on a manual refresh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-sizes-'))
  const install = tree()
  let walks = 0
  const counting: WalkIo = { readdir: (p) => (p === install && walks++, fs.readdir(p, { withFileTypes: true })), lstat: (p) => fs.lstat(p) }
  const sizes = new SizeService(dir, { io: counting, startDelayMs: 0 })
  await sizes.init()
  const changed: string[] = []
  sizes.on('changed', (id) => changed.push(id))
  const job = { id: 'xbox:A', installPath: install, sizeKey: 'A_1.0.0.0_x64__8wek', sizeOnDisk: null }

  assert.deepEqual(sizes.lookup('xbox:A', job.sizeKey), { status: 'none' })
  sizes.sync([job, { ...job, id: 'steam:1', sizeKey: undefined }, { ...job, id: 'epic:1', sizeOnDisk: 42 }], { retryFailed: false })
  assert.deepEqual(sizes.lookup('xbox:A', job.sizeKey), { status: 'measuring' })
  await sizes.idle()
  assert.deepEqual(sizes.lookup('xbox:A', job.sizeKey), { status: 'ok', bytes: 4000 })
  assert.deepEqual(changed, ['xbox:A', 'xbox:A']) // queued, then measured; the others are not measured

  sizes.sync([job], { retryFailed: true })
  await sizes.idle()
  assert.equal(walks, 1, 'same version: not walked again, even on a manual refresh')
  sizes.sync([{ ...job, sizeKey: 'A_1.1.0.0_x64__8wek' }], { retryFailed: false })
  await sizes.idle()
  assert.equal(walks, 2, 'a new package version is measured again')

  const denied = new SizeService(mkdtempSync(join(tmpdir(), 'lb-sizes-')), { io: denyUnder('Data'), startDelayMs: 0 })
  await denied.init()
  denied.sync([job], { retryFailed: false })
  await denied.idle()
  assert.deepEqual(denied.lookup('xbox:A', job.sizeKey), { status: 'denied' })

  const missing = { ...job, id: 'xbox:B', installPath: join(tmpdir(), 'lb-gone') }
  sizes.sync([missing], { retryFailed: false })
  await sizes.idle()
  assert.deepEqual(sizes.lookup('xbox:B', missing.sizeKey), { status: 'failed' })
  sizes.prune(new Set(['xbox:A']))
  assert.deepEqual(sizes.lookup('xbox:B', missing.sizeKey), { status: 'none' })
})
