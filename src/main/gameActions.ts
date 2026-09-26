import {
  clipboard,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { EventEmitter } from 'node:events'
import { sameCollection } from '@shared/collections'
import { MAX_SCREENSHOTS, type ContextAction, type Game, type GameDetails, type LaunchResult, type Notice } from '@shared/types'
import type { LaunchService } from './launch'
import type { LibraryService } from './library/library'
import type { MediaService } from './library/media'
import { providerFor } from './providers'
import { openProtocolUrl } from './providers/launchers'
import { createLogger } from './util/log'
import { resourcePath } from './window'

const log = createLogger('actions')

type MenuIcon = 'play' | 'star' | 'star-filled' | 'folder' | 'store' | 'copy' | 'hide' | 'properties' | 'collection'

/** A submenu item: a plain action, or a checkbox when `checked` is set. */
export type MenuCheck = { label: string; checked?: boolean; run: (game: Game) => void } | 'separator'

/** A right-click menu entry; `run` receives the game it was opened on. */
export type MenuEntry =
  | { label: string; icon: MenuIcon; run: (game: Game) => void }
  | { label: string; icon: MenuIcon; submenu: MenuCheck[] }
  | 'separator'

/**
 * Everything a user can do to a game, in one place. Tiles, keyboard shortcuts
 * and the right-click menu all end up here, so an action behaves the same
 * whichever way it was asked for. Unknown ids are ignored. Outcomes the user
 * should see (a copied command, a folder that won't open) are emitted as
 * 'notice' events for the renderer to show.
 */
export class GameActions extends EventEmitter {
  private readonly library: LibraryService
  private readonly launcher: LaunchService
  private readonly media: MediaService

  constructor(library: LibraryService, launcher: LaunchService, media: MediaService) {
    super()
    this.library = library
    this.launcher = launcher
    this.media = media
  }

  /** The game's store page, or null when its provider can't build one for it. */
  storePageUrl(id: string): string | null {
    const stored = this.library.stored(id)
    return stored ? (providerFor(stored.platform).storePageUrl?.(stored) ?? null) : null
  }

  async details(id: string): Promise<GameDetails | null> {
    const game = this.library.get(id)
    if (!game) return null
    const provider = providerFor(game.platform)
    let screenshots: GameDetails['screenshots'] = null
    if (provider.screenshots) {
      const files = await provider.screenshots(game).catch((err) => {
        log.warn(`screenshots for ${id} failed`, err)
        return []
      })
      screenshots = {
        total: files.length,
        items: files.slice(0, MAX_SCREENSHOTS).map((f) => ({
          url: this.media.fileUrl(f.path),
          thumbUrl: this.media.fileUrl(f.thumbnail ?? f.path),
          takenAt: f.takenAt
        }))
      }
    }
    return { coverSource: this.media.coverSource(id), screenshots }
  }

  /** Opens a screenshot listed by details() in the system image viewer. */
  async openScreenshot(url: string): Promise<void> {
    const path = this.media.filePath(url)
    if (!path) return
    const error = await shell.openPath(path)
    if (error) this.notify({ tone: 'error', title: 'Couldn’t open the screenshot', message: error })
  }

  launch(id: string): Promise<LaunchResult> {
    return this.launcher.launch(id)
  }

  setFavorite(id: string, favorite: boolean): void {
    if (this.library.get(id)) this.library.setFavorite(id, favorite)
  }

  setHidden(id: string, hidden: boolean): void {
    if (this.library.get(id)) this.library.setHidden(id, hidden)
  }

  setCollections(id: string, names: readonly string[]): void {
    if (this.library.get(id)) this.library.setCollections(id, names)
  }

  /** Adds the game to a collection, or takes it out. */
  toggleCollection(id: string, name: string): void {
    const game = this.library.get(id)
    if (!game) return
    const inIt = game.tags.some((t) => sameCollection(t, name))
    this.setCollections(id, inIt ? game.tags.filter((t) => !sameCollection(t, name)) : [...game.tags, name])
  }

  async openInstallFolder(id: string): Promise<void> {
    const game = this.library.get(id)
    if (!game) return
    const error = await shell.openPath(game.installPath)
    if (!error) return
    log.warn(`could not open ${game.installPath}: ${error}`)
    this.notify({ tone: 'error', title: 'Couldn’t open the install folder', message: game.installPath })
  }

  async openStorePage(id: string): Promise<void> {
    const game = this.library.get(id)
    const url = this.storePageUrl(id)
    if (!game || !url) return
    try {
      if (/^https:\/\//i.test(url)) await shell.openExternal(url)
      else await openProtocolUrl(url, providerFor(game.platform).label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn(`could not open the store page ${url}: ${message}`)
      this.notify({ tone: 'error', title: `Couldn’t open the store page for ${game.name}`, message })
    }
  }

  copyLaunchCommand(id: string): void {
    const game = this.library.get(id)
    if (!game) return
    clipboard.writeText(game.launchCommand)
    this.notify({ tone: 'info', title: 'Launch command copied', message: game.launchCommand })
  }

  /**
   * The right-click menu for a game. Play and Properties are handed back to
   * the renderer (`toRenderer`), because the launch transition and the sheet
   * live there. Entries a game can't support (a store page that can't be
   * built) are left out rather than shown disabled.
   */
  menuEntries(game: Game, toRenderer: (action: ContextAction, id: string) => void): MenuEntry[] {
    const entries: MenuEntry[] = [
      { label: 'Play', icon: 'play', run: (g) => toRenderer('launch', g.id) },
      game.isFavorite
        ? { label: 'Remove from favorites', icon: 'star-filled', run: (g) => this.setFavorite(g.id, false) }
        : { label: 'Add to favorites', icon: 'star', run: (g) => this.setFavorite(g.id, true) },
      'separator',
      { label: 'Open install folder', icon: 'folder', run: (g) => void this.openInstallFolder(g.id) }
    ]
    if (this.storePageUrl(game.id)) {
      entries.push({ label: 'Open store page', icon: 'store', run: (g) => void this.openStorePage(g.id) })
    }
    entries.push(
      { label: 'Copy launch command', icon: 'copy', run: (g) => this.copyLaunchCommand(g.id) },
      'separator',
      {
        label: 'Collections',
        icon: 'collection',
        submenu: [
          ...this.library.collections().map(
            (c): MenuCheck => ({ label: c.name, checked: game.tags.some((t) => sameCollection(t, c.name)), run: (g) => this.toggleCollection(g.id, c.name) })
          ),
          ...(this.library.collections().length ? (['separator'] as const) : []),
          { label: 'New collection…', run: (g) => toRenderer('new-collection', g.id) }
        ]
      },
      { label: 'Hide from library', icon: 'hide', run: (g) => this.setHidden(g.id, true) },
      { label: 'Properties…', icon: 'properties', run: (g) => toRenderer('properties', g.id) }
    )
    return entries
  }

  showMenu(id: string, win: BrowserWindow, toRenderer: (action: ContextAction, id: string) => void): void {
    const game = this.library.get(id)
    if (!game) return
    const sub = (item: MenuCheck): MenuItemConstructorOptions =>
      item === 'separator'
        ? { type: 'separator' }
        : item.checked === undefined
          ? { label: item.label, click: () => item.run(game) }
          : { label: item.label, type: 'checkbox', checked: item.checked, click: () => item.run(game) }
    const template: MenuItemConstructorOptions[] = this.menuEntries(game, toRenderer).map((entry) =>
      entry === 'separator'
        ? { type: 'separator' }
        : 'submenu' in entry
          ? { label: entry.label, icon: menuIcon(entry.icon), submenu: entry.submenu.map(sub) }
          : { label: entry.label, icon: menuIcon(entry.icon), click: () => entry.run(game) }
    )
    Menu.buildFromTemplate(template).popup({ window: win })
  }

  private notify(notice: Notice): void {
    this.emit('notice', notice)
  }
}

// ------------------------------------------------------------------ icons

const icons = new Map<string, NativeImage>()

/**
 * A menu icon (resources/menu, drawn by scripts/generate-menu-icons.cjs) in
 * the ink that reads on the menu Windows is about to draw: light icons on a
 * dark menu, dark icons on a light one. The app forces the dark theme, so this
 * is normally the light ink; the check stays so icons remain legible if Windows
 * ever draws a menu light anyway. The @2x file is picked up for high-DPI.
 */
function menuIcon(name: MenuIcon): NativeImage | undefined {
  const variant = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const key = `${name}-${variant}`
  let image = icons.get(key)
  if (!image) {
    image = nativeImage.createFromPath(resourcePath(`menu/${key}.png`))
    icons.set(key, image)
  }
  return image.isEmpty() ? undefined : image
}
