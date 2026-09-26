import { test } from 'node:test'
import assert from 'node:assert/strict'
import { folderPrefix, matchRunning, parseSnapshotLine, type WatchTarget } from '../src/main/launchWatch'
import { ProcessWatcher, type Spawner } from '../src/main/processWatch'

const targets: WatchTarget[] = [
  { id: 'steam:620', watch: { dirs: ['D:\\SteamLibrary\\steamapps\\common\\Portal 2'], steamAppId: '620' } },
  { id: 'epic:Game', watch: { dirs: ['C:\\Games\\Game'] } },
  { id: 'epic:GameTwo', watch: { dirs: ['C:/Games/GameTwo/'] } },
  { id: 'xbox:Root', watch: { dirs: ['C:\\'] } } // a drive root is never a match (would match everything)
]

test('running: matches executables under a game folder (not a sibling with a longer name) or Steam RunningAppID', () => {
  assert.equal(folderPrefix('C:/Games/Game/'), 'c:\\games\\game\\')
  assert.deepEqual([...matchRunning({ exe: ['C:\\GAMES\\GameTwo\\bin\\x.exe'], steamAppId: '0' }, targets)], ['epic:GameTwo'])
  assert.deepEqual([...matchRunning({ exe: ['c:/games/game/Game.exe'], steamAppId: '' }, targets)], ['epic:Game'])
  assert.deepEqual([...matchRunning({ exe: ['C:\\Other\\steam.exe'], steamAppId: '620' }, targets)], ['steam:620'])
  assert.deepEqual([...matchRunning({ exe: ['C:\\Program Files\\App\\app.exe'], steamAppId: '0' }, targets)], [])
})

test('running: snapshot lines, heartbeats and noise', () => {
  assert.deepEqual(parseSnapshotLine('{"exe":["C:\\\\a.exe"],"steam":"620"}'), { exe: ['C:\\a.exe'], steamAppId: '620' })
  assert.deepEqual(parseSnapshotLine('{"exe":"C:\\\\one.exe","steam":null}'), { exe: ['C:\\one.exe'], steamAppId: '' }) // PowerShell unwraps 1-item arrays
  assert.equal(parseSnapshotLine('{"same":true}'), 'same')
  assert.equal(parseSnapshotLine('WARNING: something'), null)
})

/** A fake PowerShell child: the test pushes snapshot lines through `feed`. */
function fakeSpawner() {
  const spawned: Array<{ interval: number; stopped: boolean; onLine: (l: string) => void; onExit: (c: number | null, e: string) => void }> = []
  const spawn: Spawner = (interval, onLine, onExit) => {
    const child = { interval, stopped: false, onLine, onExit }
    spawned.push(child)
    return { stop: () => void (child.stopped = true) }
  }
  const live = () => spawned.filter((c) => !c.stopped)
  const feed = (exe: string[], steam = '') => live().at(-1)!.onLine(JSON.stringify({ exe, steam }))
  return { spawn, spawned, live, feed }
}

test('watcher: runs only while demanded, at the fastest demanded rate', () => {
  const fake = fakeSpawner()
  const w = new ProcessWatcher(() => targets, fake.spawn)
  assert.equal(fake.spawned.length, 0)
  w.demand('visible', 'visible')
  assert.equal(w.pollInterval(), 2000)
  w.demand('wait', 'launch')
  assert.equal(w.pollInterval(), 1000)
  assert.equal(fake.live().length, 1, 'one child at a time')
  w.release('wait')
  assert.equal(w.pollInterval(), 2000)
  w.release('visible')
  assert.equal(w.pollInterval(), 0, 'torn down with no demand')
  assert.equal(fake.live().length, 0)
})

test('watcher: a running game keeps a slow session watch alive until it exits', () => {
  const fake = fakeSpawner()
  const w = new ProcessWatcher(() => targets, fake.spawn)
  const seen: string[][] = []
  w.on('running', (ids) => seen.push([...ids]))
  w.demand('visible', 'visible')
  fake.feed(['C:\\Games\\Game\\Game.exe'])
  assert.deepEqual([...w.running()], ['epic:Game'])
  w.release('visible') // Launchbay hides after the launch
  assert.equal(w.pollInterval(), 5000, 'still watching, slowly, while the game runs')
  fake.feed([])
  assert.equal(w.pollInterval(), 0, 'game exited: watcher torn down')
  assert.deepEqual(seen, [['epic:Game'], []])
})

test('watcher: waitFor resolves on detection, or false on timeout', async () => {
  const fake = fakeSpawner()
  const w = new ProcessWatcher(() => targets, fake.spawn)
  const found = w.waitFor('steam:620', 1000)
  assert.equal(w.pollInterval(), 1000)
  fake.feed(['C:\\x.exe'], '620')
  assert.equal(await found, true)
  assert.equal(await w.waitFor('epic:GameTwo', 30), false)
  w.dispose()
  assert.equal(w.pollInterval(), 0)
})

test('watcher: a crashed child is restarted while still demanded', async () => {
  const fake = fakeSpawner()
  const w = new ProcessWatcher(() => targets, fake.spawn)
  w.demand('visible', 'visible')
  fake.live()[0].onExit(1, 'boom')
  assert.equal(fake.live().length, 1) // the crashed one is not "stopped" by us, but the watcher no longer uses it
  await new Promise((r) => setTimeout(r, 1100))
  assert.equal(fake.spawned.length, 2, 'restarted after a backoff')
  w.dispose()
})

test('sessions: start and end with the running set; blips under 30 s are not counted', async () => {
  const { trackSessions } = await import('../src/main/library/sessions')
  const starts = new Map<string, number>()
  assert.deepEqual(trackSessions(starts, new Set(['a', 'b']), 0), { started: ['a', 'b'], ended: [] })
  assert.deepEqual(trackSessions(starts, new Set(['a', 'b']), 5_000), { started: [], ended: [] }) // still running
  assert.deepEqual(trackSessions(starts, new Set(['a']), 10_000), { started: [], ended: [] }) // b ran 10 s: a blip
  assert.deepEqual(trackSessions(starts, new Set(), 3_600_000), { started: [], ended: [{ id: 'a', seconds: 3600 }] })
  assert.equal(starts.size, 0)
})

test('playtime: the store figure is plain; Launchbay-tracked time is always flagged as such', async () => {
  const { playtimeInfo } = await import('../src/renderer/src/lib/format')
  assert.deepEqual(playtimeInfo({ playtimeMinutes: 754, trackedMinutes: 30 }), { value: '12.6 h', trackedByLaunchbay: false }) // Steam wins, unlabeled
  assert.deepEqual(playtimeInfo({ playtimeMinutes: null, trackedMinutes: 95 }), { value: '1.6 h', trackedByLaunchbay: true })
  assert.equal(playtimeInfo({ playtimeMinutes: null, trackedMinutes: null }), null)
})
