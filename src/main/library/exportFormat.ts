// Library export formats. Pure, so they are unit-tested under plain Node.

import type { Game } from '@shared/types'

export type ExportFormat = 'json' | 'csv'

/** One exported game: stable field names, dates as ISO 8601, sizes in bytes. */
export interface ExportedGame {
  name: string
  platform: Game['platform']
  platformId: string
  id: string
  installPath: string
  launchCommand: string
  sizeOnDiskBytes: number | null
  /** Why a size is missing: measuring, denied (access), failed or unreported. */
  sizeStatus: Game['sizeStatus']
  playtimeMinutes: number | null
  lastPlayed: string | null
  addedAt: string | null
  /** null: the store doesn't report updates (Epic, Xbox). */
  updateAvailable: boolean | null
  isFavorite: boolean
  isHidden: boolean
}

const iso = (ms: number | null): string | null => (ms ? new Date(ms).toISOString() : null)

export function toExported(games: Game[]): ExportedGame[] {
  return [...games]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.platform.localeCompare(b.platform))
    .map((g) => ({
      name: g.name,
      platform: g.platform,
      platformId: g.platformId,
      id: g.id,
      installPath: g.installPath,
      launchCommand: g.launchCommand,
      sizeOnDiskBytes: g.sizeOnDisk,
      sizeStatus: g.sizeStatus,
      playtimeMinutes: g.playtimeMinutes,
      lastPlayed: iso(g.lastPlayed),
      addedAt: iso(g.addedAt),
      updateAvailable: g.updateAvailable,
      isFavorite: g.isFavorite,
      isHidden: g.isHidden
    }))
}

export function libraryToJson(games: Game[], meta: { version: string; exportedAt: number }): string {
  const exported = toExported(games)
  return `${JSON.stringify({ app: 'Launchbay', version: meta.version, exportedAt: iso(meta.exportedAt), count: exported.length, games: exported }, null, 2)}\n`
}

const CSV_COLUMNS: Array<keyof ExportedGame> = [
  'name',
  'platform',
  'platformId',
  'id',
  'installPath',
  'launchCommand',
  'sizeOnDiskBytes',
  'sizeStatus',
  'playtimeMinutes',
  'lastPlayed',
  'addedAt',
  'updateAvailable',
  'isFavorite',
  'isHidden'
]

/**
 * One CSV cell (RFC 4180). Text that a spreadsheet would read as a formula
 * (starting with = + - @, tab or CR) is prefixed with an apostrophe.
 */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  if (typeof value !== 'string') return String(value)
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV with a header row, CRLF line endings and a UTF-8 BOM so Excel reads non-ASCII names. */
export function libraryToCsv(games: Game[]): string {
  const rows = toExported(games).map((g) => CSV_COLUMNS.map((c) => csvCell(g[c])).join(','))
  return `﻿${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`
}
