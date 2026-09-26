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

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
