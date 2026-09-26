// Epic Games Store library discovery from the launcher's local manifests.
// Never calls Epic's web API (it requires an authenticated session).

import { promises as fs } from 'node:fs'
import { join, win32 } from 'node:path'
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
      // Manifest paths are Windows paths wherever this runs (tests, diagnostics).
      sources.push({ kind: 'file', path: win32.isAbsolute(value) ? value : win32.join(m.InstallLocation, value) })
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

export interface CatalogEntry {
  keyImages: KeyImage[]
  /** The store page path under store.epicgames.com/p/, when the item carries one. */
  productSlug?: string
}

interface CatalogItem {
  id?: string
  keyImages?: KeyImage[]
  productSlug?: unknown
  customAttributes?: Record<string, { value?: unknown } | undefined>
}

/** Pure: a product slug fit for a store URL ("fortnite/home" becomes "fortnite"), or undefined. */
export function cleanProductSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const slug = value.trim().replace(/\/home$/i, '')
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : undefined
}

/**
 * Pure: the launcher's catalog cache (Data/Catalog/catcache.bin) is a base64
 * JSON array of catalog items. It is local data the launcher already fetched,
 * and its key images point at Epic's public CDN, so no sign-in is involved.
 */
export function parseCatalogCache(raw: string): Map<string, CatalogEntry> {
  const byItemId = new Map<string, CatalogEntry>()
  const json = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) as unknown
  if (!Array.isArray(json)) return byItemId
  for (const item of json as CatalogItem[]) {
    if (!item?.id) continue
    const productSlug =
      cleanProductSlug(item.customAttributes?.['com.epicgames.app.productSlug']?.value) ?? cleanProductSlug(item.productSlug)
    byItemId.set(item.id, {
      keyImages: Array.isArray(item.keyImages) ? item.keyImages : [],
      ...(productSlug ? { productSlug } : {})
    })
  }
  return byItemId
}

/** Pure: the store page for a game whose catalog entry had a slug. */
export function epicStorePageUrl(game: { storeRef?: string }): string | null {
  const slug = cleanProductSlug(game.storeRef)
  return slug ? `https://store.epicgames.com/p/${slug}` : null
}

/** What `findEpicDataDir` reads from the machine; replaced in tests. */
export interface EpicLocator {
  programData: string
  readRegistry: typeof readRegistry
  isDirectory: (path: string) => Promise<boolean>
}

const machine = (): EpicLocator => ({
  programData: process.env.ProgramData || 'C:\\ProgramData',
  readRegistry,
  isDirectory
})

/**
 * The launcher's data folder, or null when Epic is not installed. Throws when
 * the default folder is absent and the registry could not be read.
 */
export async function findEpicDataDir(env: EpicLocator = machine()): Promise<string | null> {
  const defaultDir = join(env.programData, 'Epic', 'EpicGamesLauncher', 'Data')
  if (await env.isDirectory(join(defaultDir, 'Manifests'))) return defaultDir
  let reg: Awaited<ReturnType<typeof readRegistry>>[number] | undefined
  try {
    ;[reg] = await env.readRegistry([
      { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', names: ['AppDataPath'] }
    ])
  } catch (err) {
    throw new Error('Could not read the Epic Games Launcher location from the registry', { cause: err })
  }
  const dir = reg?.AppDataPath
  if (typeof dir === 'string' && (await env.isDirectory(join(dir, 'Manifests')))) return dir
  return null
}

export async function scanEpic(env: EpicLocator = machine()): Promise<ScannedGame[]> {
  const dataDir = await findEpicDataDir(env)
  if (!dataDir) return []

  const manifestsDir = join(dataDir, 'Manifests')
  // The folder was there a moment ago, so a failure here is an error, not "no games".
  const files = (await fs.readdir(manifestsDir)).filter((f) => f.toLowerCase().endsWith('.item'))

  let catalog = new Map<string, CatalogEntry>()
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
      const entry = manifest.CatalogItemId ? catalog.get(manifest.CatalogItemId) : undefined
      games.set(appName, {
        platform: 'epic',
        platformId: appName,
        name: manifest.DisplayName!,
        installPath,
        launchCommand: `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`,
        sizeOnDisk: typeof manifest.InstallSize === 'number' ? manifest.InstallSize : null,
        playtimeMinutes: null,
        lastPlayed: null,
        updateAvailable: null,
        ...(entry?.productSlug ? { storeRef: entry.productSlug } : {}),
        coverSources: [
          ...manifestImageSources(manifest),
          ...rankKeyImages(entry?.keyImages ?? []).map((url): CoverSource => ({ kind: 'url', url }))
        ]
      })
    })
  )
  return [...games.values()]
}
