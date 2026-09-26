import { PLATFORM_LABELS, type Game } from '@shared/types'

const tabular = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit < 2 ? `${Math.round(value)} ${units[unit]}` : `${tabular.format(value)} ${units[unit]}`
}

export function formatPlaytime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return hours < 100 ? `${tabular.format(hours)} h` : `${Math.round(hours)} h`
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(epochMs: number | null, now = Date.now()): string {
  if (!epochMs) return 'Never'
  const seconds = Math.round((epochMs - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'Just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day')
  if (abs < 86400 * 365) return relative.format(Math.round(seconds / (86400 * 30)), 'month')
  return relative.format(Math.round(seconds / (86400 * 365)), 'year')
}

/** A game's size, or why it isn't known, in a few words. */
export function sizeText(game: Pick<Game, 'sizeOnDisk' | 'sizeStatus' | 'platform'>, style: 'short' | 'long' = 'short'): string {
  switch (game.sizeStatus) {
    case 'known':
      return formatBytes(game.sizeOnDisk)
    case 'measuring':
      return style === 'short' ? '…' : 'Measuring…'
    case 'denied':
      return style === 'short' ? 'Unknown' : 'Unknown: Windows denied access to part of the install folder'
    case 'failed':
      return style === 'short' ? 'Unknown' : 'Unknown: the install folder couldn’t be measured'
    case 'unreported':
      return style === 'short' ? '—' : `Not reported by ${PLATFORM_LABELS[game.platform]}`
  }
}

/**
 * A game's playtime for display. The store's own figure (Steam) is shown
 * plainly; Launchbay's measured one (Epic, Xbox) always carries its source.
 */
export function playtimeInfo(game: Pick<Game, 'playtimeMinutes' | 'trackedMinutes'>): { value: string; trackedByLaunchbay: boolean } | null {
  if (game.playtimeMinutes) return { value: formatPlaytime(game.playtimeMinutes), trackedByLaunchbay: false }
  if (game.trackedMinutes) return { value: formatPlaytime(game.trackedMinutes), trackedByLaunchbay: true }
  return null
}

/** A date as relative time, or a dash when unknown (unlike formatRelative's "Never"). */
export function formatWhen(epochMs: number | null, now = Date.now()): string {
  return epochMs ? formatRelative(epochMs, now) : '—'
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
