import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore, readJsonState } from '../src/main/util/fsutil'

test('JsonStore: a failed write is logged and does not throw', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-store-'))
  writeFileSync(join(dir, 'blocker'), '') // a file where the store expects a folder
  const store = new JsonStore(join(dir, 'blocker', 'settings.json'), { a: 1 })
  const errors: string[] = []
  t.mock.method(console, 'error', (line: string) => errors.push(line))
  await store.flush()
  assert.equal(errors.length, 1)
  assert.match(errors[0], /ERROR \[store\] could not save .*settings\.json/)
})

test('JsonStore: a file that will not parse is set aside, not overwritten', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-store-'))
  const file = join(dir, 'userdata.json')
  writeFileSync(file, '{"games":{"steam:400":{"favorite":true') // cut off mid-write
  t.mock.method(console, 'error', () => undefined)
  t.mock.method(console, 'warn', () => undefined)

  const store = new JsonStore<{ games: Record<string, unknown> }>(file, { games: {} })
  const data = await store.load((raw) => (raw as { games: Record<string, unknown> } | null) ?? { games: {} })
  assert.deepEqual(data, { games: {} }) // defaults in memory…
  assert.equal(readFileSync(file, 'utf8').startsWith('{"games":{"steam:400"'), true) // …and nothing touched yet

  store.data.games['epic:Fortnite'] = { favorite: true }
  await store.flush()
  const kept = readdirSync(dir).filter((n) => /^userdata\.damaged-\d{8}T\d{6}\.json$/.test(n))
  assert.equal(kept.length, 1)
  assert.equal(readFileSync(join(dir, kept[0]), 'utf8'), '{"games":{"steam:400":{"favorite":true')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { games: { 'epic:Fortnite': { favorite: true } } })

  await store.flush() // only the first save sets the file aside
  assert.equal(readdirSync(dir).filter((n) => n.includes('damaged')).length, 1)
})

test('JsonStore: a missing file and a good file leave no damaged copy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-store-'))
  const fresh = new JsonStore(join(dir, 'fresh.json'), { n: 0 })
  assert.deepEqual(await fresh.load((raw) => (raw as { n: number } | null) ?? { n: 0 }), { n: 0 })
  await fresh.flush()

  writeFileSync(join(dir, 'good.json'), '﻿{"n":7}') // a BOM is fine
  const good = new JsonStore(join(dir, 'good.json'), { n: 0 })
  assert.deepEqual(await good.load((raw) => raw as { n: number }), { n: 7 })
  await good.flush()

  assert.deepEqual(readdirSync(dir).sort(), ['fresh.json', 'good.json'])
})

test('readJsonState: tells a missing file from an unusable one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-store-'))
  writeFileSync(join(dir, 'empty.json'), '')
  assert.deepEqual(await readJsonState(join(dir, 'nope.json')), { state: 'missing' })
  assert.equal((await readJsonState(join(dir, 'empty.json'))).state, 'damaged')
  assert.equal((await readJsonState(dir)).state, 'damaged') // a folder where the file should be
})
