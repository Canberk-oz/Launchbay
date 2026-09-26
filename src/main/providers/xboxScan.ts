// Xbox app / Microsoft Store (UWP and GDK) game discovery.
//
// Get-AppxPackage lists every packaged app, so games have to be picked out
// heuristically: known system and platform packages are excluded, and a
// package must then show at least one game signal (a GDK MicrosoftGame.config,
// an Xbox Live protocol, an XboxGames install folder, or game-engine files).

import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { runPowerShellJson } from '../util/powershell'
import { readImageSize } from '../util/imageSize'
import type { CoverSource, ScannedGame } from './types'

interface RawStartApp {
  Name: string
  AppID: string
}

interface RawPackage {
  Name: string
  PackageFamilyName: string
  PackageFullName: string
  InstallLocation: string
  Publisher: string
  StartApps: Array<RawStartApp | null> | RawStartApp | null
}

// Get-StartApps supplies the display names Windows shows in Start (already
// localized, no ms-resource: strings) and the exact AppIDs to launch with.
const LIST_PACKAGES_SCRIPT = `
$apps = @{}
try {
  foreach ($a in Get-StartApps) {
    $id = [string]$a.AppID
    $bang = $id.IndexOf('!')
    if ($bang -lt 1) { continue }
    $pfn = $id.Substring(0, $bang)
    if (-not $apps.ContainsKey($pfn)) { $apps[$pfn] = New-Object System.Collections.ArrayList }
    [void]$apps[$pfn].Add([pscustomobject]@{ Name = [string]$a.Name; AppID = $id })
  }
} catch {}
$out = New-Object System.Collections.ArrayList
foreach ($p in (Get-AppxPackage -PackageTypeFilter Main)) {
  if ($p.IsFramework -or $p.IsResourcePackage -or $p.NonRemovable) { continue }
  if ([string]$p.SignatureKind -ne 'Store') { continue }
  if (-not $p.InstallLocation) { continue }
  $start = @()
  if ($apps.ContainsKey($p.PackageFamilyName)) { $start = @($apps[$p.PackageFamilyName]) }
  [void]$out.Add([pscustomobject]@{
    Name = $p.Name
    PackageFamilyName = $p.PackageFamilyName
    PackageFullName = $p.PackageFullName
    InstallLocation = $p.InstallLocation
    Publisher = $p.Publisher
    StartApps = $start
  })
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($out) -Compress -Depth 4))
`

// System components, codecs, the Xbox app itself and everyday Store apps.
// Several of these carry Xbox protocols or engine-like files, so they must be
// excluded before the game signals are checked.
const EXCLUDED_PACKAGES: RegExp[] = [
  /^Microsoft\.(Xbox|Gaming)/i,
  /^Microsoft\.Windows/i,
  /^MicrosoftWindows\./i,
  /^Windows\./i,
  /^MicrosoftCorporationII\./i,
  /^Microsoft\.(VCLibs|NET|UI\.Xaml|Services|DirectX|Advertising|DesktopAppInstaller|StorePurchaseApp|WindowsStore|Winget|LanguageExperiencePack|WebMediaExtensions|ApplicationCompatibilityEnhancements|WidgetsPlatformRuntime|StartExperiencesApp|MicrosoftEdge|Edge|Office|OneDrive|Bing|Zune|YourPhone|People|Todos|MicrosoftStickyNotes|Paint|ScreenSketch|GetHelp|Getstarted|PowerAutomateDesktop|OutlookForWindows|Copilot|DevHome|MicrosoftOfficeHub|549981C3F5F10|SecHealthUI|Messaging|OneConnect|SkypeApp|MixedReality|Print3D|3DBuilder|Microsoft3DViewer|Whiteboard|Photos|MSPaint|Teams|WindowsTerminal|WindowsNotepad|WindowsCalculator|WindowsCamera|WindowsAlarms|WindowsSoundRecorder|WindowsFeedbackHub|WindowsMaps)/i,
  /^Microsoft\.\w*(Video|Image|Media)Extensions?$/i,
  /^MSTeams$/i,
  /^Clipchamp\./i
]

// Files and folders that only game engines and game middleware ship.
const ENGINE_MARKERS = new Set([
  'unityplayer.dll',
  'gameassembly.dll',
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe',
  'winuaprunner.exe', // GameMaker UWP runner
  'data.win',
  'monogame.framework.dll',
  'fna.dll',
  'microsoft.xna.framework.dll',
  'fmod.dll',
  'fmod64.dll',
  'fmodstudio.dll',
  'fmodstudio64.dll',
  'aksoundengine.dll',
  'bink2w64.dll',
  'binkw64.dll',
  'binkw32.dll',
  'physx3_x64.dll',
  'physx_64.dll',
  'physxcommon_64.dll',
  'steam_api64.dll',
  'eossdk-win64-shipping.dll',
  'gamelaunchhelper.exe',
  'engine' // Unreal Engine folder
])

export function isExcludedPackage(name: string): boolean {
  return EXCLUDED_PACKAGES.some((re) => re.test(name))
}

export interface AppxApplication {
  id: string
  displayName?: string
  hidden: boolean
  protocols: string[]
  logos: string[]
}

export interface AppxManifest {
  displayName?: string
  logo?: string
  applications: AppxApplication[]
}

export interface GameConfig {
  displayName?: string
  logos: string[]
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => name === 'Application' || name === 'Extension' || name === 'Protocol'
})

const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined
  if (v && typeof v === 'object' && '#text' in v) return String((v as { '#text': unknown })['#text']).trim() || undefined
  return undefined
}

/** Resource references (ms-resource:...) cannot be shown as-is. */
const literal = (v: string | undefined): string | undefined => (v && !/^ms-resource:/i.test(v) ? v : undefined)

type Node = Record<string, unknown>

/** Pure: pulls names, applications, protocols and logo paths out of AppxManifest.xml. */
export function parseAppxManifest(source: string): AppxManifest | null {
  const doc = xml.parse(source) as { Package?: Node }
  const pkg = doc.Package
  if (!pkg) return null
  const props = (pkg.Properties ?? {}) as Node
  const apps = (((pkg.Applications ?? {}) as Node).Application ?? []) as Node[]

  return {
    displayName: text(props.DisplayName),
    logo: text(props.Logo),
    applications: apps.map((app) => {
      const ve = (app.VisualElements ?? {}) as Node
      const tile = (ve.DefaultTile ?? {}) as Node
      const extensions = (((app.Extensions ?? {}) as Node).Extension ?? []) as Node[]
      const protocols = extensions
        .filter((e) => e.Category === 'windows.protocol')
        .flatMap((e) => ((e.Protocol ?? []) as Node[]).map((p) => String(p.Name ?? '')))
        .filter(Boolean)
      const logos = [tile.Square310x310Logo, ve.Square150x150Logo, tile.Wide310x150Logo, ve.Square44x44Logo]
        .map((v) => text(v))
        .filter((v): v is string => !!v)
      return {
        id: String(app.Id ?? 'App'),
        displayName: text(ve.DisplayName),
        hidden: String(ve.AppListEntry ?? '').toLowerCase() === 'none',
        protocols,
        logos
      }
    })
  }
}

/** Pure: GDK games describe themselves in MicrosoftGame.config. */
export function parseGameConfig(source: string): GameConfig | null {
  const doc = xml.parse(source) as { Game?: Node }
  if (!doc.Game) return null
  const visuals = (doc.Game.ShellVisuals ?? {}) as Node
  return {
    displayName: text(visuals.DefaultDisplayName),
    logos: [visuals.Square480x480Logo, visuals.Square150x150Logo, visuals.SplashScreenImage, visuals.StoreLogo]
      .map((v) => text(v))
      .filter((v): v is string => !!v)
  }
}

/** Pure: the reasons a package looks like a game; empty means it is not one. */
export function gameSignals(input: {
  hasGameConfig: boolean
  protocols: string[]
  installLocation: string
  rootEntries: string[]
}): string[] {
  const signals: string[] = []
  if (input.hasGameConfig) signals.push('gdk-config')
  if (input.protocols.some((p) => /^(ms-xbl-|xboxliveapp-)/i.test(p))) signals.push('xbox-live')
  if (/\\XboxGames\\/i.test(input.installLocation)) signals.push('xboxgames-folder')
  if (input.rootEntries.some((e) => ENGINE_MARKERS.has(e.toLowerCase()) || /_data$/i.test(e))) signals.push('engine-files')
  return signals
}

interface AssetCandidate {
  path: string
  score: number
}

/**
 * Resolves a manifest asset reference such as `Assets\Logo.png` to the best
 * qualified file on disk (`Logo.scale-200.png`, `Logo.targetsize-256.png`,
 * `scale-200\Logo.png`, ...), skipping high-contrast variants.
 */
async function resolveAsset(root: string, reference: string): Promise<AssetCandidate | null> {
  const full = join(root, reference.replace(/\//g, '\\'))
  const dir = dirname(full)
  const ext = extname(full).toLowerCase()
  const stem = basename(full, extname(full)).toLowerCase()
  const files: string[] = []

  const collect = async (folder: string, exact: boolean): Promise<void> => {
    let entries: string[]
    try {
      entries = await fs.readdir(folder)
    } catch {
      return
    }
    for (const entry of entries) {
      const lower = entry.toLowerCase()
      if (extname(lower) !== ext || /contrast-(black|white|high)/.test(lower)) continue
      const matches = exact ? lower === stem + ext : lower === stem + ext || lower.startsWith(stem + '.')
      if (matches) files.push(join(folder, entry))
    }
  }

  await collect(dir, false)
  // Qualifier folders, e.g. Assets\scale-200\Logo.png
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && /^(scale|targetsize|contrast-standard)/i.test(entry.name)) {
        await collect(join(dir, entry.name), true)
      }
    }
  } catch {
    // asset folder missing
  }

  let best: AssetCandidate | null = null
  for (const path of files) {
    const size = await readImageSize(path)
    if (!size) continue
    // Largest centered square: favors big square art over wide banners.
    let score = Math.min(size.width, size.height) ** 2
    if (/altform-(light)?unplated/i.test(path)) score *= 0.9
    if (!best || score > best.score) best = { path, score }
  }
  return best
}

async function inspectPackage(pkg: RawPackage): Promise<ScannedGame | null> {
  if (isExcludedPackage(pkg.Name)) return null
  const root = pkg.InstallLocation

  let manifest: AppxManifest | null
  try {
    manifest = parseAppxManifest(await fs.readFile(join(root, 'AppxManifest.xml'), 'utf8'))
  } catch {
    return null
  }
  if (!manifest || manifest.applications.length === 0) return null

  let gameConfig: GameConfig | null = null
  try {
    gameConfig = parseGameConfig(await fs.readFile(join(root, 'MicrosoftGame.config'), 'utf8'))
  } catch {
    // not a GDK title
  }

  const rootEntries = await fs.readdir(root).catch(() => [] as string[])
  const signals = gameSignals({
    hasGameConfig: gameConfig !== null,
    protocols: manifest.applications.flatMap((a) => a.protocols),
    installLocation: root,
    rootEntries
  })
  if (signals.length === 0) return null

  const app = manifest.applications.find((a) => !a.hidden) ?? manifest.applications[0]
  const startApps = (Array.isArray(pkg.StartApps) ? pkg.StartApps : [pkg.StartApps]).filter(
    (s): s is RawStartApp => !!s && typeof s.AppID === 'string'
  )
  const start = startApps.find((s) => s.AppID === `${pkg.PackageFamilyName}!${app.id}`) ?? startApps[0]
  const appId = start ? start.AppID.slice(start.AppID.indexOf('!') + 1) : app.id

  const name =
    start?.Name ||
    literal(gameConfig?.displayName) ||
    literal(manifest.displayName) ||
    literal(app.displayName) ||
    pkg.Name

  const references = [...(gameConfig?.logos ?? []), ...app.logos, ...(manifest.logo ? [manifest.logo] : [])]
  const resolved = (await Promise.all(references.map((r) => resolveAsset(root, r)))).filter(
    (c): c is AssetCandidate => c !== null
  )
  // Every distinct candidate goes to the media cache, which picks the one with
  // the most visible artwork once it can look at the pixels.
  const coverSources: CoverSource[] = [...new Map(resolved.map((c) => [c.path.toLowerCase(), c])).values()]
    .sort((a, b) => b.score - a.score)
    .map((c) => ({ kind: 'file', path: c.path }))

  return {
    platform: 'xbox',
    platformId: pkg.PackageFamilyName,
    name,
    installPath: root,
    launchCommand: `shell:AppsFolder\\${pkg.PackageFamilyName}!${appId}`,
    sizeOnDisk: null,
    playtimeMinutes: null,
    lastPlayed: null,
    coverSources
  }
}

export async function scanXbox(): Promise<ScannedGame[]> {
  let packages: RawPackage[] | RawPackage | null
  try {
    packages = await runPowerShellJson<RawPackage[] | RawPackage | null>(LIST_PACKAGES_SCRIPT, { timeoutMs: 60_000 })
  } catch {
    return [] // PowerShell or the Appx module unavailable
  }
  const list = Array.isArray(packages) ? packages : packages ? [packages] : []
  const games = await Promise.all(list.map((p) => inspectPackage(p).catch(() => null)))
  return games.filter((g): g is ScannedGame => g !== null)
}
