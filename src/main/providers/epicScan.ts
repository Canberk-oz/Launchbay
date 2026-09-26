// Epic Games Store library discovery from the launcher's local manifests.
// Never calls Epic's web API (it requires an authenticated session).

import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isDirectory, stripBom } from '../util/fsutil'
import { readRegistry } from '../util/registry'
import type { CoverSource, ScannedGame } from './types'

export interface EpicManifest {
  DisplayName?: string
  AppName?: string
  InstallLocation?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  MainGameAppName?: string
  AppCategories?: unknown[]
  bIsIncompleteInstall?: boolean
  InstallSize?: number
  [key: string]: unknown
}

interface KeyImage {
  type?: string
  url?: string
  width?: number
  height?: number
}

/** Pure: true for a complete install of a base game (not DLC, engine or plugin). */
export function isInstalledEpicGame(m: EpicManifest): boolean {
  if (!m.AppName || !m.DisplayName || !m.InstallLocation) return false
  if (m.bIsIncompleteInstall) return false
  if (m.MainGameAppName && m.MainGameAppName !== m.AppName) return false // DLC or add-on
  if (Array.isArray(m.AppCategories) && m.AppCategories.length > 0) {
    const categories = m.AppCategories.map((c) => String(c).toLowerCase())
    if (!categories.includes('games')) return false // Unreal Engine, plugins, other applications
  }
  return true
}

/** Pure: any image the manifest itself points at, as a URL or a file inside the install. */
export function manifestImageSources(m: EpicManifest): CoverSource[] {
  const sources: CoverSource[] = []
  for (const [key, value] of Object.entries(m)) {
    if (typeof value !== 'string' || !/image|icon|logo|boxart|cover|thumb/i.test(key)) continue
    if (/^https?:\/\//i.test(value)) sources.push({ kind: 'url', url: value })
    else if (/\.(png|jpe?g|webp)$/i.test(value) && m.InstallLocation) {
      sources.push({ kind: 'file', path: isAbsolute(value) ? value : join(m.InstallLocation, value) })
    }
  }
  return sources
}

const KEY_IMAGE_PRIORITY = [
  'DieselGameBoxTall',
  'OfferImageTall',
  'Thumbnail',
  'CodeRedemption_340x440',
  'DieselStoreFrontTall',
  'DieselGameBox',
  'OfferImageWide',
  'DieselStoreFrontWide',
  'Featured'
]

/** Pure: orders a catalog item's key images, portrait box art first. */
export function rankKeyImages(images: KeyImage[]): string[] {
  const rank = (img: KeyImage): number => {
    const i = KEY_IMAGE_PRIORITY.indexOf(img.type ?? '')
    if (i >= 0) return i
    const tall = (img.height ?? 0) > (img.width ?? 0)
    return KEY_IMAGE_PRIORITY.length + (tall ? 0 : 1)
  }
  return images
    .filter((img) => typeof img.url === 'string' && /^https?:\/\//i.test(img.url))
    .sort((a, b) => rank(a) - rank(b))
    .map((img) => img.url!)
}

/**
 * Pure: the launcher's catalog cache (Data/Catalog/catcache.bin) is a base64
 * JSON array of catalog items. It is local data the launcher already fetched,
 * and its key images point at Epic's public CDN, so no sign-in is involved.
 */
export function parseCatalogCache(raw: string): Map<string, KeyImage[]> {
  const byItemId = new Map<string, KeyImage[]>()
  const json = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) as unknown
  if (!Array.isArray(json)) return byItemId
  for (const item of json as Array<{ id?: string; keyImages?: KeyImage[] }>) {
    if (item?.id && Array.isArray(item.keyImages)) byItemId.set(item.id, item.keyImages)
  }
  return byItemId
}

async function findEpicDataDir(): Promise<string | null> {
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  const defaultDir = join(programData, 'Epic', 'EpicGamesLauncher', 'Data')
  if (await isDirectory(join(defaultDir, 'Manifests'))) return defaultDir
  try {
    const [reg] = await readRegistry([
      { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', names: ['AppDataPath'] }
    ])
    const dir = reg?.AppDataPath
    if (typeof dir === 'string' && (await isDirectory(join(dir, 'Manifests')))) return dir
  } catch {
    // no registry access; treat as not installed
  }
  return null
}

export async function scanEpic(): Promise<ScannedGame[]> {
  const dataDir = await findEpicDataDir()
  if (!dataDir) return []

  const manifestsDir = join(dataDir, 'Manifests')
  let files: string[]
  try {
    files = (await fs.readdir(manifestsDir)).filter((f) => f.toLowerCase().endsWith('.item'))
  } catch {
    return []
  }

  let catalog = new Map<string, KeyImage[]>()
  try {
    catalog = parseCatalogCache(await fs.readFile(join(dataDir, 'Catalog', 'catcache.bin'), 'utf8'))
  } catch {
    // no catalog cache yet: covers fall back to the placeholder tile
  }

  const games = new Map<string, ScannedGame>()
  await Promise.all(
    files.map(async (file) => {
      let manifest: EpicManifest
      try {
        manifest = JSON.parse(stripBom(await fs.readFile(join(manifestsDir, file), 'utf8'))) as EpicManifest
      } catch {
        return // corrupt or partially written manifest
      }
      if (!isInstalledEpicGame(manifest)) return
      const installPath = manifest.InstallLocation!
      if (!(await isDirectory(installPath))) return

      const appName = manifest.AppName!
      const catalogImages = manifest.CatalogItemId ? (catalog.get(manifest.CatalogItemId) ?? []) : []
      games.set(appName, {
        platform: 'epic',
        platformId: appName,
        name: manifest.DisplayName!,
        installPath,
        launchCommand: `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`,
        sizeOnDisk: typeof manifest.InstallSize === 'number' ? manifest.InstallSize : null,
        playtimeMinutes: null,
        lastPlayed: null,
        coverSources: [
          ...manifestImageSources(manifest),
          ...rankKeyImages(catalogImages).map((url): CoverSource => ({ kind: 'url', url }))
        ]
      })
    })
  )
  return [...games.values()]
}
