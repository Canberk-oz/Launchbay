// Runs the platform scanners outside Electron and prints what they find.
// Usage: node --import ./tests/register.mjs scripts/scan-diagnostics.ts
import { scanSteam } from '../src/main/providers/steamScan'
import { scanEpic } from '../src/main/providers/epicScan'
import { scanXbox } from '../src/main/providers/xboxScan'

for (const [label, scan] of [['Steam', scanSteam], ['Epic', scanEpic], ['Xbox', scanXbox]] as const) {
  const started = Date.now()
  const games = await scan()
  console.log(`\n== ${label}: ${games.length} game(s) in ${Date.now() - started} ms`)
  for (const g of games) {
    console.log(`- ${g.name} [${g.platformId}]`)
    console.log(`    install: ${g.installPath}`)
    console.log(`    launch:  ${g.launchCommand}`)
    console.log(`    size: ${g.sizeOnDisk ?? '-'}  playtime: ${g.playtimeMinutes ?? '-'} min  lastPlayed: ${g.lastPlayed ? new Date(g.lastPlayed).toISOString() : '-'}`)
    console.log(`    covers: ${g.coverSources.map((s) => (s.kind === 'url' ? s.url : s.path)).join('\n            ')}`)
  }
}
