// Steam library discovery. No Electron imports, so it can run under plain Node
// for tests and diagnostics.

import { promises as fs } from 'node:fs'
import { join, win32 } from 'node:path'
import { parseVdf, vdfObject, vdfPath, vdfString, type VdfObject } from '../util/vdf'
import { isDirectory, pathExists } from '../util/fsutil'
import { readRegistry } from '../util/registry'
import type { CoverSource, ScannedGame, ScreenshotFile } from './types'

const DEFAULT_STEAM_PATH = 'C:\\Program Files (x86)\\Steam'
const CDN = 'https://cdn.akamai.steamstatic.com/steam/apps'
const STEAMID64_BASE = 76561197960265728n

// Installed "apps" that are runtimes and tools rather than games.
const EXCLUDED_APPIDS = new Set([
  '228980', // Steamworks Common Redistributables
  '250820', // SteamVR
  '1070560', // Steam Linux Runtime
  '1391110', // Steam Linux Runtime - Soldier
  '1628350', // Steam Linux Runtime - Sniper
  '1826330', // Proton EasyAntiCheat Runtime
  '1161040' // Proton BattlEye Runtime
])
const EXCLUDED_NAMES = [
  /^Steamworks Common Redistributables$/i,
  /^Steam Linux Runtime/i,
  /^Proton\b/i,
  /^Source SDK( Base)?\b/i,
  /Dedicated Server$/i
]

// StateFlags bits (see Steam's EAppState).
const STATE_UPDATE_REQUIRED = 2
const STATE_FULLY_INSTALLED = 4
const STATE_UNINSTALLING = 2048

/** What `findSteamPath` reads from the machine; replaced in tests. */
export interface SteamLocator {
  readRegistry: typeof readRegistry
  isDirectory: (path: string) => Promise<boolean>
}

const machine: SteamLocator = { readRegistry, isDirectory }

/**
 * The Steam folder, or null when Steam is not installed. Throws when the
 * registry could not be read and the default folder is absent, because then
 * "not installed" and "installed somewhere else" can't be told apart.
 */
export async function findSteamPath(env: SteamLocator = machine): Promise<string | null> {
  const candidates: string[] = []
  let registryError: unknown = null
  try {
    const [hkcu, hklm] = await env.readRegistry([
      { key: 'HKCU\\Software\\Valve\\Steam', names: ['SteamPath'] },
      { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', names: ['InstallPath'] }
    ])
    if (typeof hkcu?.SteamPath === 'string') candidates.push(hkcu.SteamPath)
    if (typeof hklm?.InstallPath === 'string') candidates.push(hklm.InstallPath)
  } catch (err) {
    registryError = err // PowerShell unavailable or blocked; try the default location.
  }
  candidates.push(DEFAULT_STEAM_PATH)

  for (const candidate of candidates) {
    const normalized = win32.normalize(candidate)
    if (await env.isDirectory(join(normalized, 'steamapps'))) return normalized
  }
  if (registryError) throw new Error('Could not read the Steam location from the registry', { cause: registryError })
  return null
}

/** Pure: extracts library folder paths from libraryfolders.vdf (both formats). */
export function parseLibraryFolders(vdfText: string): string[] {
  const root = vdfObject(parseVdf(vdfText), 'libraryfolders')
  if (!root) return []
  const paths: string[] = []
  for (const [key, value] of Object.entries(root)) {
    if (!/^\d+$/.test(key)) continue
    if (typeof value === 'string') paths.push(value) // pre-2021 format: "1" "D:\\SteamLibrary"
    else {
      const p = vdfString(value, 'path')
      if (p) paths.push(p)
    }
  }
  return paths
}

export interface AppManifest {
  appid: string
  name: string
  installdir: string
  stateFlags: number
  buildid: string
  sizeOnDisk: number | null
  lastPlayed: number | null
}

/** Pure: reads the fields Launchbay needs from an appmanifest_<appid>.acf. */
export function parseAppManifest(acfText: string): AppManifest | null {
  const state = vdfObject(parseVdf(acfText), 'AppState')
  if (!state) return null
  const appid = vdfString(state, 'appid')
  const installdir = vdfString(state, 'installdir')
  if (!appid || !installdir) return null
  const num = (key: string): number | null => {
    const raw = vdfString(state, key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const lastPlayedSec = num('LastPlayed')
  return {
    appid,
    name: vdfString(state, 'name') || `App ${appid}`,
    installdir,
    stateFlags: num('StateFlags') ?? 0,
    buildid: vdfString(state, 'buildid') ?? '0',
    sizeOnDisk: num('SizeOnDisk'),
    lastPlayed: lastPlayedSec ? lastPlayedSec * 1000 : null
  }
}

export function isPlayableManifest(m: AppManifest): boolean {
  if (EXCLUDED_APPIDS.has(m.appid)) return false
  if (EXCLUDED_NAMES.some((re) => re.test(m.name))) return false
  if (m.stateFlags & STATE_UNINSTALLING) return false
  // Fully installed, or installed and currently updating (buildid is set once
  // a first install has completed; a fresh download in progress reports 0).
  return (m.stateFlags & STATE_FULLY_INSTALLED) !== 0 || (m.buildid !== '' && m.buildid !== '0')
}

/** Pure: Steam has an update queued for this app (StateFlags UpdateRequired). */
export function hasPendingUpdate(m: AppManifest): boolean {
  return (m.stateFlags & STATE_UPDATE_REQUIRED) !== 0
}

async function readLibraryPaths(steamPath: string): Promise<string[]> {
  const seen = new Map<string, string>()
  const add = (p: string): void => {
    const normalized = win32.normalize(p)
    const key = normalized.toLowerCase().replace(/\\+$/, '')
    if (!seen.has(key)) seen.set(key, normalized)
  }
  add(steamPath)
  for (const file of [join(steamPath, 'steamapps', 'libraryfolders.vdf'), join(steamPath, 'config', 'libraryfolders.vdf')]) {
    try {
      parseLibraryFolders(await fs.readFile(file, 'utf8')).forEach(add)
    } catch {
      // file absent in this Steam version
    }
  }
  return [...seen.values()]
}

interface UserStats {
  playtimeMinutes: number | null
  lastPlayed: number | null
}

/** Playtime and last-played per appid for the most recent local Steam user. */
async function readUserStats(steamPath: string): Promise<Map<string, UserStats>> {
  const stats = new Map<string, UserStats>()
  const userdata = join(steamPath, 'userdata')
  let accountId: string | null = null

  try {
    const users = vdfObject(parseVdf(await fs.readFile(join(steamPath, 'config', 'loginusers.vdf'), 'utf8')), 'users')
    let best: { id: string; recent: boolean; ts: number } | null = null
    for (const [steamId64, info] of Object.entries(users ?? {})) {
      if (typeof info !== 'object' || !/^\d+$/.test(steamId64)) continue
      const recent = vdfString(info, 'MostRecent') === '1'
      const ts = Number(vdfString(info, 'Timestamp') ?? 0)
      if (!best || (recent && !best.recent) || (recent === best.recent && ts > best.ts)) {
        best = { id: steamId64, recent, ts }
      }
    }
    if (best) accountId = (BigInt(best.id) - STEAMID64_BASE).toString()
  } catch {
    // no loginusers.vdf
  }

  // Fall back to whichever user's localconfig.vdf was written most recently.
  let configFile = accountId ? join(userdata, accountId, 'config', 'localconfig.vdf') : null
  if (!configFile || !(await pathExists(configFile))) {
    configFile = null
    let newest = 0
    try {
      for (const dir of await fs.readdir(userdata)) {
        const candidate = join(userdata, dir, 'config', 'localconfig.vdf')
        try {
          const { mtimeMs } = await fs.stat(candidate)
          if (mtimeMs > newest) {
            newest = mtimeMs
            configFile = candidate
          }
        } catch {
          // no config for this user
        }
      }
    } catch {
      return stats
    }
  }
  if (!configFile) return stats

  try {
    const apps = vdfPath(
      parseVdf(await fs.readFile(configFile, 'utf8')),
      'UserLocalConfigStore',
      'Software',
      'Valve',
      'Steam',
      'apps'
    )
    if (apps && typeof apps === 'object') {
      for (const [appid, entry] of Object.entries(apps as VdfObject)) {
        if (typeof entry !== 'object') continue
        const playtime = Number(vdfString(entry, 'Playtime'))
        const lastPlayed = Number(vdfString(entry, 'LastPlayed'))
        stats.set(appid, {
          playtimeMinutes: Number.isFinite(playtime) && playtime > 0 ? playtime : null,
          lastPlayed: Number.isFinite(lastPlayed) && lastPlayed > 0 ? lastPlayed * 1000 : null
        })
      }
    }
  } catch {
    // unreadable config: playtime is optional
  }
  return stats
}

/** Cover art Steam itself has cached locally, used when the CDN is unreachable. */
async function localCacheImages(steamPath: string, appid: string): Promise<{ capsule: string[]; header: string[] }> {
  const base = join(steamPath, 'appcache', 'librarycache')
  const capsule: string[] = []
  const header: string[] = []
  const classify = (dir: string, file: string): void => {
    if (/^library_(600x900|capsule)(_2x)?\.jpg$/i.test(file)) capsule.push(join(dir, file))
    else if (/^header(_2x)?\.jpg$/i.test(file)) header.push(join(dir, file))
  }

  // 2024+ layout: librarycache/<appid>/[<hash>/]file.jpg
  const appDir = join(base, appid)
  try {
    for (const entry of await fs.readdir(appDir, { withFileTypes: true })) {
      if (entry.isFile()) classify(appDir, entry.name)
      else if (entry.isDirectory()) {
        const sub = join(appDir, entry.name)
        try {
          for (const file of await fs.readdir(sub)) classify(sub, file)
        } catch {
          // unreadable subfolder
        }
      }
    }
  } catch {
    // Older layout: librarycache/<appid>_library_600x900.jpg
    for (const [file, list] of [
      [`${appid}_library_600x900.jpg`, capsule],
      [`${appid}_header.jpg`, header]
    ] as const) {
      const p = join(base, file)
      if (await pathExists(p)) list.push(p)
    }
  }
  return { capsule, header }
}

// The Steam folder found by the last scan, so screenshot lookups don't query the registry again.
let lastSteamPath: string | null = null

/** The Steam folder: the last scan's, or found now. Null when Steam isn't installed or can't be read. */
export async function steamRoot(): Promise<string | null> {
  return lastSteamPath ?? (await findSteamPath().catch(() => null))
}

/**
 * Screenshots Steam keeps for an app, for every local Steam user
 * (userdata/<account>/760/remote/<appid>/screenshots), newest first, with
 * Steam's own thumbnails where it made them. Unreadable folders are skipped.
 */
export async function findScreenshots(steamPath: string, appid: string): Promise<ScreenshotFile[]> {
  if (!/^\d+$/.test(appid)) return []
  const userdata = join(steamPath, 'userdata')
  const users = await fs.readdir(userdata).catch(() => [] as string[])
  const found: ScreenshotFile[] = []
  for (const user of users) {
    if (!/^\d+$/.test(user)) continue
    const dir = join(userdata, user, '760', 'remote', appid, 'screenshots')
    const names = await fs.readdir(dir).catch(() => [] as string[])
    const thumbs = new Set((await fs.readdir(join(dir, 'thumbnails')).catch(() => [] as string[])).map((n) => n.toLowerCase()))
    await Promise.all(
      names
        .filter((n) => /\.(jpe?g|png)$/i.test(n))
        .map(async (name) => {
          const path = join(dir, name)
          const st = await fs.stat(path).catch(() => null)
          if (!st?.isFile()) return
          found.push({
            path,
            takenAt: st.mtimeMs,
            ...(thumbs.has(name.toLowerCase()) ? { thumbnail: join(dir, 'thumbnails', name) } : {})
          })
        })
    )
  }
  return found.sort((a, b) => b.takenAt - a.takenAt)
}

export async function scanSteam(env: SteamLocator = machine): Promise<ScannedGame[]> {
  const steamPath = await findSteamPath(env)
  if (!steamPath) return []
  if (env === machine) lastSteamPath = steamPath

  const [libraries, userStats] = await Promise.all([readLibraryPaths(steamPath), readUserStats(steamPath)])
  const byAppId = new Map<string, ScannedGame>()

  for (const library of libraries) {
    const steamapps = join(library, 'steamapps')
    let files: string[]
    try {
      files = await fs.readdir(steamapps)
    } catch {
      continue // drive unplugged or library removed
    }

    await Promise.all(
      files
        .filter((f) => /^appmanifest_\d+\.acf$/i.test(f))
        .map(async (file) => {
          let manifest: AppManifest | null
          try {
            manifest = parseAppManifest(await fs.readFile(join(steamapps, file), 'utf8'))
          } catch {
            return
          }
          if (!manifest || !isPlayableManifest(manifest)) return
          const installPath = join(steamapps, 'common', manifest.installdir)
          if (!(await isDirectory(installPath))) return
          if (byAppId.has(manifest.appid)) return // stale duplicate manifest in a second library

          const stats = userStats.get(manifest.appid)
          const local = await localCacheImages(steamPath, manifest.appid)
          const coverSources: CoverSource[] = [
            { kind: 'url', url: `${CDN}/${manifest.appid}/library_600x900.jpg` },
            ...local.capsule.map((path): CoverSource => ({ kind: 'file', path })),
            { kind: 'url', url: `${CDN}/${manifest.appid}/header.jpg` },
            ...local.header.map((path): CoverSource => ({ kind: 'file', path }))
          ]
          const lastPlayed = Math.max(manifest.lastPlayed ?? 0, stats?.lastPlayed ?? 0) || null

          byAppId.set(manifest.appid, {
            platform: 'steam',
            platformId: manifest.appid,
            name: manifest.name,
            installPath,
            launchCommand: `steam://run/${manifest.appid}`,
            sizeOnDisk: manifest.sizeOnDisk,
            playtimeMinutes: stats?.playtimeMinutes ?? null,
            lastPlayed,
            updateAvailable: hasPendingUpdate(manifest),
            coverSources
          })
        })
    )
  }

  return [...byAppId.values()]
}

// ---------------------------------------------------------------------------
// Trailers

export interface SteamMovie {
  id?: number
  name?: string
  highlight?: boolean
  mp4?: Record<string, string>
  webm?: Record<string, string>
  dash_h264?: string
  dash_av1?: string
  hls_h264?: string
}

/**
 * Pure: picks a playable trailer from an appdetails `movies` array. Steam used
 * to return progressive mp4/webm URLs; since mid-2025 it returns DASH and HLS
 * manifests instead. Both shapes are handled.
 */
export function pickTrailer(movies: SteamMovie[] | undefined): { kind: 'dash' | 'progressive'; url: string } | null {
  if (!Array.isArray(movies) || movies.length === 0) return null
  const ordered = [...movies.filter((m) => m.highlight !== false), ...movies.filter((m) => m.highlight === false)]
  for (const movie of ordered) {
    const progressive = movie.mp4?.['480'] ?? movie.webm?.['480'] ?? movie.mp4?.max ?? movie.webm?.max
    if (progressive) return { kind: 'progressive', url: progressive }
    if (movie.dash_h264) return { kind: 'dash', url: movie.dash_h264 }
    if (movie.dash_av1) return { kind: 'dash', url: movie.dash_av1 }
  }
  return null
}
