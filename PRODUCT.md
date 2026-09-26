# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-specified: Electron (main process scans the filesystem and registry and launches games; the renderer draws the UI) with React, and a local JSON-file cache. Tooling delegated: electron-vite, Vite and TypeScript, chosen because they give one typed build for the main, preload and renderer processes.

## Users

One person on a Windows PC whose installed games are spread across Steam, Epic Games and the Xbox app / Microsoft Store (PC Game Pass). Their job is to find a game and start it in seconds without first deciding which store's launcher to open.

## Product Purpose

Launchbay gathers every installed PC game from several storefronts into one browsable library with large cover art and one-click launch. It succeeds when any installed game can be found and started in seconds, whether the user is browsing covers or has summoned the overlay mid-session.

## Positioning

A single library that covers every storefront on the machine. It reads only what is already installed, needs no platform accounts or logins, and can be summoned over anything with a global hotkey.

## Operating Context

- Windows 11 desktop app. It runs as a normal resizable window and also as an always-on-top overlay toggled by a global hotkey (default Ctrl+Shift+G). The hotkey works while another app or game has focus, or while Launchbay is minimized to the system tray.
- Browsing and overlay use carry equal weight (confirmed by the user). Browsing means scrolling covers, previewing trailers and pinning favorites. Overlay use means summon, find, launch, then get out of the way.
- Libraries range from a handful of games to 500 or more.
- The launch hand-off goes to each store's own launcher (Steam, Epic Games Launcher, Xbox shell), and that launcher may take several seconds.

## Capabilities and Constraints

- Providers, one per platform, each with `scan()` and `launch(game)`: Steam (registry and default path, `libraryfolders.vdf`, `appmanifest_*.acf`), Epic (`Manifests/*.item`), and Xbox/Microsoft Store (`Get-AppxPackage` plus a heuristic that excludes system packages). GOG, Battle.net and Ubisoft Connect should be addable later without touching the UI.
- The game record holds an id, name, platform, cached cover, a nullable trailer URL, install path, launch command, last-scanned time, a favorite flag, last-played time and favorited-at time.
- Steam cover art comes from the public CDN. Epic cover art comes only from local data, never Epic's authenticated web API. Xbox cover art comes from the package's own logo assets.
- Hover trailer previews exist for Steam only. As of 2026-09, Steam's store API serves DASH/HLS manifests rather than the mp4/webm files the original spec assumed.
- The UI has name search, All / Steam / Epic / Xbox filters, grid and list views, a tile-size slider, favorites pinned to the top, a launch transition, a hover trailer preview, a manual library refresh, and a settings panel for rebinding the hotkey.
- The same game owned on two stores shows up as two tiles. There is no fuzzy deduplication.
- A platform that isn't installed is skipped silently. A failed art or trailer download is remembered and retried only on a manual refresh. A hotkey conflict is shown in settings and never crashes the app.

## Brand Commitments

- The name is **Launchbay** (confirmed by the user).
- The app defaults to a dark theme on a near-black ground (#0d0d0f or similar), never pure black, so that dark cover art stands out (user-pinned).

## Evidence on Hand

- No logo, icon or brand assets exist yet. The app icon has to be made from scratch.
- Cover art and trailers belong to the platforms and are fetched at runtime. Nothing is bundled.
- There are no testimonials, metrics or marketing claims, and none should be invented.

## Product Principles

1. **Seconds to play.** Browsing, search and the overlay each lead to a launch in the fewest possible steps.
2. **Degrade quietly, never break.** A missing platform is skipped, missing art gets a designed fallback, and a failed launch or hotkey conflict is reported rather than left hanging.
3. **Local and account-free.** The app reads what is installed and never scrapes APIs that need a login.
4. **Platform-neutral core.** Stores plug in behind one interface. The UI only varies by a provider's declared capabilities, such as whether it has trailers.
5. **Light on the machine.** The network is used only for art and for trailers the user hovers, results are cached, and the app stays cheap while idle in the tray.
