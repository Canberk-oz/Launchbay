import type { Game, Platform } from '@shared/types'

/** Where a cover image can come from, tried in order until one works. */
export type CoverSource = { kind: 'url'; url: string } | { kind: 'file'; path: string }

/**
 * What a provider knows about an installed game. The library service turns it
 * into a full `Game` by adding the user's own state (favorites, hidden, last
 * played from Launchbay) and the media cache state (cover, trailer).
 */
export interface ScannedGame {
  platform: Platform
  /** Unique within the platform: Steam appid, Epic AppName, Xbox PackageFamilyName. */
  platformId: string
  name: string
  installPath: string
  launchCommand: string
  sizeOnDisk: number | null
  playtimeMinutes: number | null
  /** Epoch ms, as recorded by the platform itself. */
  lastPlayed: number | null
  coverSources: CoverSource[]
}

export interface TrailerInfo {
  /** `dash`: an MPD manifest; `progressive`: a directly playable mp4/webm. */
  kind: 'dash' | 'progressive'
  url: string
}

export interface LaunchWatch {
  /** A process whose image lies under one of these folders means the game started. */
  dirs: string[]
  /** Steam only: HKCU\Software\Valve\Steam\RunningAppID reaching this value also counts. */
  steamAppId?: string
}

/**
 * One storefront. Adding GOG, Battle.net or Ubisoft Connect later means
 * writing one of these and registering it in `providers/index.ts`; the UI and
 * the library core only ever talk to this interface.
 */
export interface GameProvider {
  readonly platform: Platform
  readonly label: string

  /**
   * Returns the installed games. Must resolve to `[]`, not throw, when the
   * platform or its launcher is not installed on this machine.
   */
  scan(): Promise<ScannedGame[]>

  /** Hands the game to the platform's launcher. Throws when the hand-off fails. */
  launch(game: Game): Promise<void>

  /** Optional capability: a trailer for hover previews. Throw on transient failure, return null for "no trailer". */
  resolveTrailer?(game: Game): Promise<TrailerInfo | null>

  /** Optional capability: how to recognise that the game is actually running. */
  launchWatch?(game: Game): LaunchWatch
}
