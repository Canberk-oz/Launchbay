import { Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { Game, GameDetails, LaunchResult } from '@shared/types'
import type { LaunchService } from './launch'
import type { LibraryService } from './library/library'
import type { MediaService } from './library/media'
import { providerFor } from './providers'
import { createLogger } from './util/log'

const log = createLogger('actions')

/** A right-click menu entry; `run` receives the game it was opened on. */
export type MenuEntry = { label: string; run: (game: Game) => void } | 'separator'

/**
 * Everything a user can do to a game, in one place. Tiles, keyboard shortcuts
 * and the right-click menu all end up here, so an action behaves the same
 * whichever way it was asked for. Unknown ids are ignored.
 */
export class GameActions {
  private readonly library: LibraryService
  private readonly launcher: LaunchService
  private readonly media: MediaService

  constructor(library: LibraryService, launcher: LaunchService, media: MediaService) {
    this.library = library
    this.launcher = launcher
    this.media = media
  }

  /** The game's store page, or null when its provider can't build one for it. */
  storePageUrl(id: string): string | null {
    const stored = this.library.stored(id)
    return stored ? (providerFor(stored.platform).storePageUrl?.(stored) ?? null) : null
  }

  details(id: string): GameDetails | null {
    if (!this.library.get(id)) return null
    return { coverSource: this.media.coverSource(id) }
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

  async openInstallFolder(id: string): Promise<void> {
    const game = this.library.get(id)
    if (!game) return
    const error = await shell.openPath(game.installPath)
    if (error) log.warn(`could not open ${game.installPath}: ${error}`)
  }

  /**
   * The right-click menu for a game. Play is handed back to the renderer
   * (`requestLaunch`) because the launch transition starts there.
   */
  menuEntries(game: Game, requestLaunch: (id: string) => void): MenuEntry[] {
    return [
      { label: 'Play', run: (g) => requestLaunch(g.id) },
      {
        label: game.isFavorite ? 'Remove from favorites' : 'Add to favorites',
        run: (g) => this.setFavorite(g.id, !g.isFavorite)
      },
      'separator',
      { label: 'Open install folder', run: (g) => void this.openInstallFolder(g.id) },
      { label: 'Hide from library', run: (g) => this.setHidden(g.id, true) }
    ]
  }

  showMenu(id: string, win: BrowserWindow, requestLaunch: (id: string) => void): void {
    const game = this.library.get(id)
    if (!game) return
    const template: MenuItemConstructorOptions[] = this.menuEntries(game, requestLaunch).map((entry) =>
      entry === 'separator' ? { type: 'separator' } : { label: entry.label, click: () => entry.run(game) }
    )
    Menu.buildFromTemplate(template).popup({ window: win })
  }
}
