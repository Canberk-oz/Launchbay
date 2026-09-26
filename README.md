# Launchbay

A Windows game launcher that puts every installed PC game from **Steam**, the **Epic Games Launcher** and the **Xbox app / Microsoft Store** on one shelf. It shows large cover art, previews trailers on hover, launches in one click, and has a global hotkey overlay.

Built with Electron 44, React 19, Vite (electron-vite) and TypeScript.

## Getting started

Requires Windows 10/11 and Node.js 22.12 or newer.

```bash
npm install
npm run dev          # run with hot reload
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development app with hot reload (F12 or Ctrl+Shift+I opens DevTools) |
| `npm run build` then `npm start` | Production bundle in `out/`, then run it |
| `npm run dist` | Windows installer: `dist/Launchbay-Setup-<version>.exe` |
| `npm run dist:dir` | Unpacked app only: `dist/win-unpacked/Launchbay.exe` |
| `npm test` | Unit tests (parsers, heuristics, DASH planning, shortcut validation) |
| `npm run typecheck` | Type-checks the main, preload and renderer code |
| `npm run scan:diagnose` | Runs the three platform scanners without Electron and prints what they find |
| `npm run icons` | Regenerates the app and tray icons (they are drawn procedurally) |

> Electron 44 downloads its binary on first run rather than at install time. If that is blocked, run `npx install-electron`.
> The installer is unsigned, so Windows SmartScreen will ask for confirmation the first time.

## Using it

- **Browse:** covers stand face-out in a grid (100–320 px, set with the slider) or in a dense list. Filter by All, Steam, Epic or Xbox, and sort by name, recently played or size.
- **Favorites:** hover a cover and click its star. Favorites are pinned in their own section above the full library, and they respect the platform filter.
- **Trailer preview (Steam):** keep the pointer on a cover. A yellow hairline fills for 800 ms, then a muted, looping trailer crossfades in.
- **Launch:** click a cover. It lifts off the shelf, fills the window and blurs while the store's launcher starts the game. The view returns to the grid once the game is detected, after about 9 seconds without a detection, or immediately with an error on the tile if the hand-off fails.
- **Overlay:** **Ctrl+Shift+G** (configurable) shows Launchbay centered and on top of whatever you're doing, with the cursor already in search. Type, press **Enter** to play the top match, and press the hotkey or Esc to hide it again. Closing the window keeps Launchbay in the tray, so the hotkey still works.
- **Right-click a game:** Play, Add/Remove favorite, Open install folder, Hide from library. Hidden games can be restored from Settings.

| Key | Action |
| --- | --- |
| Ctrl+Shift+G (default) | Show or hide the overlay from anywhere |
| Ctrl+F or / | Search |
| Enter (in search) | Play the top match |
| ↓ from search, arrow keys | Move between games |
| Enter / Space | Launch the focused game |
| F | Toggle favorite on the focused game |
| Ctrl + / Ctrl − | Larger or smaller tiles |
| F5 / Ctrl+R | Refresh the library |
| Ctrl+, | Settings |
| Esc | Clear search, close settings, leave the launch screen, or hide the overlay |

## How games are found

Every store is a **provider** in `src/main/providers/` that implements one interface (`providers/types.ts`):

```ts
interface GameProvider {
  platform: Platform
  scan(): Promise<ScannedGame[]>           // [] when the store isn't installed, never throws
  launch(game: Game): Promise<void>        // throws when the hand-off fails
  resolveTrailer?(game): Promise<TrailerInfo | null>   // optional capability
  launchWatch?(game): LaunchWatch                      // optional: how to detect "running"
}
```

To add GOG Galaxy, Battle.net or Ubisoft Connect, write one of these, register it in `providers/index.ts`, and add the platform to `shared/types.ts`. The UI and library core only ever talk to this interface.

- **Steam:** reads `SteamPath` from `HKCU\Software\Valve\Steam` (then `HKLM`, then `C:\Program Files (x86)\Steam`), every library in `steamapps\libraryfolders.vdf` (both file formats), and each `appmanifest_*.acf`. Playtime and last-played come from the local `userdata\<id>\config\localconfig.vdf`. Covers come from the Steam CDN (`library_600x900.jpg`, then `header.jpg`), with Steam's own local `appcache\librarycache` as the offline fallback. Games launch with `steam://run/<appid>`.
- **Epic:** reads `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` and skips DLC, engine and plugin entries and incomplete installs. Covers come first from image fields in the manifest, then from the launcher's **local** catalog cache (`Catalog\catcache.bin`, whose image URLs point at Epic's public CDN). Epic's authenticated web API is never called. Games launch with `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true`.
- **Xbox / Microsoft Store:** runs `Get-AppxPackage` (plus `Get-StartApps` for the names Windows displays), reads each `AppxManifest.xml` and any GDK `MicrosoftGame.config`, and picks out games heuristically. Known system, codec and platform packages are excluded, and a package must then show a game signal: a GDK config, an Xbox Live protocol, an `XboxGames` install folder, or game-engine files. The cover is the package logo asset with the most visible artwork. Transparent logos are printed on a box front with the title below. Games launch through `explorer.exe shell:AppsFolder\<PackageFamilyName>!<AppId>`, using the app's real Application Id from the manifest.

A missing store is skipped silently. A failed cover or trailer lookup is remembered and retried only on **Refresh library**, while the automatic rescan at startup doesn't retry it.

## Where the spec met reality

- **Steam trailers are DASH now, not mp4/webm.** As of 2025 the store API (`appdetails`) returns `dash_h264` / `hls_h264` manifests. Launchbay reads the MPD and downloads the init segment plus about 30 s of the smallest video representation that is at least 480p, starting 6 s in to skip studio logos. It rebases the fragments into one small fragmented MP4 (a few MB) and caches it, so the first hover takes about a second and later hovers are instant. If the API ever returns progressive mp4/webm again, those are streamed and cached as well. Lookups are throttled to stay under Steam's rate limit, and the trailer cache is capped at 768 MB (least recently used files are evicted first).
- **Epic covers** use the launcher's local catalog cache as well as the manifest, because `.item` files carry no image fields in practice.
- **Xbox detection** needs positive game signals as well as the exclusion list. Otherwise every Store app (WhatsApp, Clipchamp, and so on) would show up as a game. If something is misdetected, right-click it and choose **Hide from library**.
- **Launch confirmation** watches for a process running from the game's install folder (for Steam, `RunningAppID` in the registry also counts).
- **Hide Launchbay once a game is running** is on by default, so the overlay gets out of the way. You can turn it off in Settings.

## Data and privacy

Everything stays on this PC, under `%APPDATA%\Launchbay`:

- `library.json`: the cached scan results
- `userdata.json`: favorites, hidden games, and last played from Launchbay
- `settings.json`, `window.json`
- `media/`: cached covers and trailer previews
- `launchbay.log`

Network requests go to the Steam CDN and store API (covers and trailer lookups) and to Epic's public image CDN. There are no accounts and no telemetry.

## Development flags

- `LAUNCHBAY_DRY_RUN=1` simulates launches without starting anything. `LAUNCHBAY_DRY_RUN=fail` simulates a failed launch.
- `LAUNCHBAY_USER_DATA=<folder>` runs against a throwaway profile.

## Project layout

```
src/main/        Electron main process: providers, library + media cache, launching, hotkey, window, tray, IPC
src/preload/     The typed window.launchbay bridge (context isolation, sandboxed)
src/renderer/    React UI (Back of the Box design system: see DESIGN.md)
src/shared/      Types, IPC channel names, shortcut helpers shared by both sides
tests/           node:test unit tests (run TypeScript directly)
scripts/         Icon generator, scanner diagnostics
```

## Known limitations

- Playtime is available for Steam only. Epic and Xbox keep theirs in the cloud. Install size is not shown for Xbox games.
- The Epic provider is covered by unit tests but was not run against a live Epic install on the development machine. GDK (PC Game Pass) detection is exercised by tests. Classic Store games (Forager, Solitaire) were verified live.
