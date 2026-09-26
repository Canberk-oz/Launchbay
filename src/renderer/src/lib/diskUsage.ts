import { PLATFORM_LABELS, PLATFORMS, type Game } from '@shared/types'

/** Totals for one slice of the library (a store, a drive, or all of it). */
export interface UsageGroup {
  key: string
  label: string
  /** Sum of the sizes that are known. */
  bytes: number
  games: number
  known: number
  measuring: number
  /** Sizes that could not be learned: access denied, measuring failed, or not reported. */
  unknown: number
}

export interface DiskUsage {
  total: UsageGroup
  byPlatform: UsageGroup[]
  byDrive: UsageGroup[]
  /** Largest known sizes first. */
  largest: Game[]
  /** Games whose size is unknown, with the reason in their sizeStatus. */
  unknown: Game[]
}

/** Pure: the drive an install path lives on ("C:", a UNC share, or "/" off Windows). */
export function driveOf(path: string): string {
  const letter = /^([a-z]):/i.exec(path)
  if (letter) return `${letter[1].toUpperCase()}:`
  const unc = /^\\\\([^\\]+)\\([^\\]+)/.exec(path)
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`
  return '/'
}

function group(key: string, label: string): UsageGroup {
  return { key, label, bytes: 0, games: 0, known: 0, measuring: 0, unknown: 0 }
}

function add(g: UsageGroup, game: Game): void {
  g.games++
  if (game.sizeStatus === 'known' && game.sizeOnDisk !== null) {
    g.known++
    g.bytes += game.sizeOnDisk
  } else if (game.sizeStatus === 'measuring') g.measuring++
  else g.unknown++
}

/**
 * Pure: where the disk space goes. Hidden games count too (they still take
 * space). Every group keeps its unknown and measuring counts next to the
 * total, so a gap in the numbers is shown rather than hidden.
 */
export function diskUsage(games: Game[], largestCount = 10): DiskUsage {
  const total = group('all', 'All games')
  const platforms = new Map(PLATFORMS.map((p) => [p, group(p, PLATFORM_LABELS[p])]))
  const drives = new Map<string, UsageGroup>()
  for (const game of games) {
    add(total, game)
    add(platforms.get(game.platform)!, game)
    const drive = driveOf(game.installPath)
    if (!drives.has(drive)) drives.set(drive, group(drive, drive))
    add(drives.get(drive)!, game)
  }
  const bySize = (a: UsageGroup, b: UsageGroup): number => b.bytes - a.bytes || a.label.localeCompare(b.label)
  return {
    total,
    byPlatform: [...platforms.values()].filter((g) => g.games > 0).sort(bySize),
    byDrive: [...drives.values()].sort(bySize),
    largest: games
      .filter((g) => g.sizeStatus === 'known' && g.sizeOnDisk !== null)
      .sort((a, b) => (b.sizeOnDisk ?? 0) - (a.sizeOnDisk ?? 0))
      .slice(0, largestCount),
    unknown: games
      .filter((g) => g.sizeStatus !== 'known' && g.sizeStatus !== 'measuring')
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}
