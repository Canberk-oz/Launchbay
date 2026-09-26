import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore } from '../src/main/util/fsutil'

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
