import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, initLogFile } from '../src/main/util/log'

test('log: a file past 1 MB is kept as .old and a fresh one starts', (t) => {
  t.mock.method(console, 'log', () => undefined)
  const dir = mkdtempSync(join(tmpdir(), 'lb-log-'))
  const file = join(dir, 'launchbay.log')

  writeFileSync(file, 'small\n')
  initLogFile(file)
  assert.deepEqual(readdirSync(dir), ['launchbay.log']) // under the limit: left alone

  writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))
  writeFileSync(`${file}.old`, 'an older run')
  initLogFile(file)
  createLogger('test').info('hello', { n: 1 }, new Error('boom'))

  assert.equal(statSync(`${file}.old`).size, 1024 * 1024 + 1) // the big file replaced the older copy
  const fresh = readFileSync(file, 'utf8')
  assert.match(fresh, /^\d{4}-\d\d-\d\dT[\d:.]+Z INFO \[test\] hello \{"n":1\} Error: boom/)
})
