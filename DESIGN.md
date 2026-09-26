---
name: Launchbay
description: Every installed PC game from every store on one shelf, with the chrome set like the spec block on the back of the box.
colors:
  shelf-black: "#0d0d0f"
  shelf-layer: "#151518"
  shelf-layer-raised: "#1c1c21"
  shelf-layer-pressed: "#26262c"
  hairline: "rgba(236, 235, 230, 0.08)"
  hairline-strong: "rgba(236, 235, 230, 0.14)"
  hairline-bold: "rgba(236, 235, 230, 0.24)"
  print-edge: "rgba(255, 255, 255, 0.08)"
  print-edge-strong: "rgba(255, 255, 255, 0.12)"
  shadow-ink: "rgba(0, 0, 0, 0.6)"
  box-paper: "#ecebe6"
  box-paper-bright: "#ffffff"
  box-paper-pressed: "#d9d8d2"
  spec-gray: "#8f8f98"
  ghost-gray: "#6b6b73"
  sticker-yellow: "#ffcc33"
  sticker-yellow-bright: "#ffd75c"
  sticker-ink: "#1a1405"
  recall-red: "#ff6b5b"
  recall-ink: "#2a0b07"
  steam-slate-light: "#2a475e"
  steam-slate: "#1b2838"
  steam-slate-deep: "#10161f"
  steam-signal: "#66c0f4"
  epic-graphite-light: "#3a3a41"
  epic-graphite: "#1e1e22"
  epic-graphite-deep: "#0f0f11"
  epic-signal: "#f2f2f2"
  xbox-green-light: "#1c8a1c"
  xbox-green: "#0f5a10"
  xbox-green-deep: "#082b09"
  xbox-signal: "#b6f15a"
typography:
  display:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(26px, 4.2vw, 48px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum' 1, 'lnum' 1"
  label:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 72"
  box-type:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(12px, 11.5cqw, 30px)"
    fontWeight: 850
    lineHeight: 1.02
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 80"
  micro:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 72"
  tile-name:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(11.5px, 7.4cqw, 15px)"
    fontWeight: 650
    lineHeight: 1.2
  box-type-logo:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(11px, 9cqw, 24px)"
    fontWeight: 850
    lineHeight: 1.02
    fontVariation: "'wdth' 80"
  box-foot:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(8px, 5.2cqw, 11px)"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 72"
  wordmark:
    fontFamily: "Archivo Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.16em"
    fontVariation: "'wdth' 72"
rounded:
  frame: "3px"
  keycap: "4px"
  badge: "5px"
  tile: "6px"
  control: "8px"
  notice: "10px"
  capsule: "999px"
spacing:
  hairline-gap: "4px"
  tight: "8px"
  unit: "16px"
  edge: "24px"
components:
  button-primary:
    backgroundColor: "{colors.box-paper}"
    textColor: "{colors.shelf-black}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 11px"
  button-primary-hover:
    backgroundColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.box-paper}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 11px"
  button-secondary-hover:
    backgroundColor: "{colors.shelf-layer-raised}"
  filter-pill:
    backgroundColor: "transparent"
    textColor: "{colors.box-paper}"
    rounded: "{rounded.capsule}"
    height: "28px"
    padding: "0 4px 0 11px"
  filter-pill-active:
    backgroundColor: "{colors.box-paper}"
    textColor: "{colors.shelf-black}"
  count-chip:
    backgroundColor: "{colors.shelf-layer-raised}"
    textColor: "{colors.spec-gray}"
    rounded: "{rounded.capsule}"
    height: "20px"
  count-chip-active:
    backgroundColor: "{colors.shelf-black}"
    textColor: "{colors.box-paper}"
  search-field:
    backgroundColor: "{colors.shelf-layer}"
    textColor: "{colors.box-paper}"
    rounded: "{rounded.control}"
    height: "30px"
  keycap:
    backgroundColor: "{colors.shelf-layer-raised}"
    textColor: "{colors.spec-gray}"
    rounded: "{rounded.keycap}"
    height: "20px"
  favorite-sticker:
    backgroundColor: "{colors.sticker-yellow}"
    textColor: "{colors.sticker-ink}"
    rounded: "{rounded.capsule}"
    size: "30px"
  game-tile:
    backgroundColor: "{colors.shelf-layer}"
    rounded: "{rounded.tile}"
  notice:
    backgroundColor: "{colors.shelf-layer-raised}"
    textColor: "{colors.box-paper}"
    rounded: "{rounded.notice}"
    padding: "12px 10px 12px 14px"
  switch-on:
    backgroundColor: "{colors.sticker-yellow}"
    rounded: "{rounded.capsule}"
    width: "36px"
    height: "20px"
---

# Design System: Launchbay

## Overview

**Creative North Star: "Back of the Box"**

Launchbay treats every installed game the way a retail shelf did: covers face out, big and uncropped, and the chrome around them is set like the spec block printed on the back of a boxed PC game (condensed caps, hairline rules, tabular figures, drawn keycaps). The covers carry all the color and drama. The shell stays near-black, quiet and exact, so a wall of dark cover art pops rather than competing with a themed frame.

The system is dense where people scan (the list view reads like a system-requirements table) and generous where people browse (the cover wall, the launch lift-off). Motion is feedback, apart from one authored moment: on launch the cover lifts off the shelf and grows to fill the window, blurred and dimmed, while a disc spins up.

It refuses the category defaults of slate panels, a left rail and blue selection, and of the neon-glow gaming dashboard. It also stays clear of retro costume: no barcodes, rating-box pastiche or fake shrinkwrap gloss. The discipline is type and rules, not props.

**Key Characteristics:**
- Near-black shelf, colorless chrome, one sticker-yellow accent.
- Archivo from a single variable family: condensed caps for every label, normal width for game names.
- Hairline-ruled spec headers with right-aligned counts divide the shelf.
- Face-out 2:3 covers that lift on hover; transparent logos and missing art become printed box fronts.
- Drawn keycaps for every keyboard hint.

## Colors

A colorless shell with one warm signal color, plus the platform colors, which appear only where a store's own box front needs printing.

### Primary
- **Sticker Yellow** (#ffcc33): the favorite sticker, focus rings, the "Enter plays…" hint, switches in the on state, and the launch disc's glint and check. It marks what is chosen or about to happen.

### Neutral
- **Shelf Black** (#0d0d0f): the page, title strip and toolbar ground. Never pure black.
- **Shelf Layer** (#151518), **Raised** (#1c1c21), **Pressed** (#26262c): the settings sheet, the search field, count chips, keycaps and hover fills, one step per level of interaction.
- **Box Paper** (#ecebe6): primary text, the active filter pill and primary buttons, like the paper white of a printed box.
- **Spec Gray** (#8f8f98): secondary text, labels and placeholders (6:1 on Shelf Black).
- **Ghost Gray** (#6b6b73): inactive icon glyphs and empty counts only, never running text.
- **Hairlines** (box-paper at 8% / 14% / 24%): rules, control outlines and dividers.
- **Print Edge** (white at 8% / 12%): the printed border inside cover art, badges, stickers and box-front frames.
- **Shadow Ink** (black at 60%): the dark behind lifted covers, the launch card and the launch title.

### Tertiary
- **Recall Red** (#ff6b5b): failure states only (a tile that couldn't launch, error notices, a taken hotkey).
- **Platform box-front colors**: Steam slate (#2a475e → #1b2838 → #10161f, signal #66c0f4), Epic graphite (#3a3a41 → #1e1e22 → #0f0f11, signal #f2f2f2) and Xbox green (#1c8a1c → #0f5a10 → #082b09, signal #b6f15a). They appear only as 165° gradients on box fronts (missing art, transparent logos) and as the loading ground behind a cover.

### Named Rules
**The One Sticker Rule.** Sticker Yellow marks favorites, focus, the primary-action hint and "on" states. It is never decoration, never a fill for a region, and never used for a second meaning.

**The Colorless Shell Rule.** The chrome carries no hue of its own. Color comes from the covers and from platform box fronts, never from panels, headers or borders.

## Typography

**Display Font:** Archivo Variable (with Segoe UI Variable, system-ui)
**Body Font:** Archivo Variable at normal width
**Label Font:** Archivo Variable at 72% width

**Character:** One grotesk used across its width axis, the way a box back mixes condensed spec type with regular body copy. Width, not a second family, carries the hierarchy.

### Hierarchy
- **Display** (800, clamp(26px, 4.2vw, 48px), 1.04): the game's name during the launch transition.
- **Headline** (700, 22px, 1.2): empty-state titles and the settings sheet title (20px).
- **Title** (600, 14px): game names in list rows; 650 at 11.5–15px in tile captions.
- **Body** (400, 13px, 1.4, tabular lining figures): controls, settings copy, notices.
- **Label** (650, 11px, +0.09em, uppercase, 72% width): section heads, column heads, sort label, spec-table keys. **Micro** (10px) is the same label at its smallest: tile meta, error stamps, the version line.
- **Tile Name** (650, clamp(11.5px, 7.4cqw, 15px)): the hover caption, sized to the tile it sits on.
- **Box Type** (850, 80% width, uppercase, 1.02): titles printed on box fronts, sized in container units so they fill the tile; a smaller cut (clamp(11px, 9cqw, 24px)) sits under a printed logo, and the platform name at the foot is Label at clamp(8px, 5.2cqw, 11px).
- **Wordmark** (800, 13px, +0.16em, uppercase, 72% width): "LAUNCHBAY" in the title strip.

### Named Rules
**The Spec Label Rule.** Every label, head, column title and meta line uses condensed caps. Game names never do; a name is set at normal width so it reads as content, not chrome.

**The Tabular Rule.** Figures are tabular and lining everywhere (counts, sizes, playtime), so columns and chips never jitter.

## Layout

- The shell is three bands: a 44px title strip (a draggable region, with native caption buttons floating over a transparent overlay), a 48px toolbar (filters left; sort, tile size, view and refresh right), and the shelf filling the rest.
- The page edge is 24px. The gutter between tiles is 16px and is the base unit for toolbar gaps, section-head spacing and list column gaps.
- The cover wall is a virtualized grid of whole tiles at 2:3. The slider (100–320px) sets a target width, the column count that lands closest to it wins, and tiles stretch to fill whole columns, so the wall never shows a ragged edge.
- Sections (Favorites, then All games; Results while searching) open with a spec head: title, a hairline to the edge, then the count. There is more space above a head than below it.
- The list view is a spec table: 32×48 thumb, name, platform, playtime, size, last played and star, with a sticky column header.
- Narrow windows (the minimum is 720px): the wordmark drops below 960px, pill labels drop below 900px (All keeps its label), and the list's Last played column drops below 980px.

## Elevation & Depth

The shelf is flat. Only the covers cast shadows, and a cover lifts when it is hovered or focused. Overlays (the settings sheet, notices, the launch scene) separate by tone and scrim rather than stacking shadows.

### Shadow Vocabulary
- **Tile at rest** (`0 1px 2px rgb(0 0 0 / 0.45), 0 10px 22px -14px rgb(0 0 0 / 0.8)`): the box sitting on the shelf.
- **Tile lifted** (`0 3px 6px rgb(0 0 0 / 0.5), 0 26px 48px -18px rgb(0 0 0 / 0.9)` with `scale(1.05)`): hover, keyboard focus, playing preview.
- **Sticker** (`0 2px 6px rgb(0 0 0 / 0.5)` plus an inner `0 -2px 0` shade): the favorite sticker sits on the shrinkwrap.
- **Sheet edge** (`-24px 0 60px -20px rgb(0 0 0 / 0.8)`): the settings sheet sliding over the shelf.

### Named Rules
**The Lift-Off Rule.** Depth answers state. Nothing floats at rest except the covers, and a cover lifts only when it is hovered, focused or previewing.

## Shapes

- Covers have barely rounded corners (6px), like a box's softened edge, and a 1px Print Edge inside, the printed border of the box.
- Controls use an 8px radius. Filters and count chips are full capsules. Keycaps use a 4px radius with a 2px darker bottom lip.
- Box fronts carry an inset printed frame (1px Print Edge, 3px corners, inset 5% of the tile width). Small inset parts (the platform badge, the search clear button) use 5px corners; list thumbnails use 3px.
- The favorite sticker is a circle and the launch loader is a disc (rim, hub, glint). Circles are reserved for these two.

## Components

### Buttons
- **Shape:** 8px radius, 28px tall, 11px side padding, 12.5px/600 text.
- **Primary:** Box Paper fill with Shelf Black text (Change, Show all games, Clear search). Hover goes pure white.
- **Secondary:** a transparent fill with a 14% hairline outline. Hover fills with Raised and strengthens the outline to 24%.
- **Icon button:** a 32px square with a Spec Gray glyph. Hover fills with Raised and turns the glyph Box Paper. An alert dot in Recall Red flags a problem (for example, a taken hotkey).

### Filter pills
- **Style:** capsule, 28px, a platform glyph, the label, and a count chip.
- **Active:** the pill fills with Box Paper and the count chip inverts to Shelf Black with Box Paper text.
- **Empty store:** a dashed ghost outline with a Ghost Gray count. It stays clickable and leads to a designed empty state.

### Game tiles
- **Corner style:** 6px. **Background:** Shelf Layer until the art fades in (220ms).
- **Hover or focus:** lifts to 1.05 (180ms ease-out), a caption scrim rises with the name (Title) and meta (Label), and the platform badge hides.
- **Favorite sticker:** top-right, 20–30px by tile size. It appears on hover; once the game is a favorite it stays, filled with Sticker Yellow.
- **Platform badge:** bottom-left, a boxed glyph (18–24px) on 78% Shelf Black.
- **States:** armed (a yellow hairline fills across the bottom over the 800ms hover delay), loading (the hairline pulses), previewing (the muted trailer crossfades in over 300ms), launching (the slot empties to a ghost while the cover lifts away), failed (a 2px Recall Red edge plus a "Couldn't launch" label).

### Inputs / Fields
- **Search:** Shelf Layer, 30px, 8px radius, a hairline outline. When focused it fills with Raised, strengthens the outline and gains a 3px Sticker Yellow halo at 12%. At rest it shows Ctrl F keycaps; while typing it shows a yellow "Enter plays <top match>" hint and a clear button.
- **Slider:** a 3px track filled Spec Gray up to the value, with a 14px Box Paper thumb.
- **Switch:** 36×20. Off is Pressed with a Spec Gray knob; on is Sticker Yellow with a Sticker Ink knob.

### Navigation
- The title strip holds the wordmark, the centered search field and the settings button. The toolbar holds the filter pills plus sort (Label "SORT" and a quiet select), tile size, a grid/list segmented control (active segment on Pressed) and "Refresh library" (its icon spins while scanning).

### Signature: Box front
The printed fallback for missing art: a platform gradient with a soft top sheen, the inset frame, the platform mark in its signal color, the name set in Box Type, and the platform name in Label at the foot. Transparent package logos (Store/Xbox) use the same box front, with the logo printed above the name.

### Signature: Launch lift-off
Clicking a cover (or pressing Enter) FLIPs it from its exact tile rect to cover the window with a uniform scale (520ms, `cubic-bezier(0.25, 0.8, 0.2, 1)`), blurring to about 26px on screen and dimming to 50%. The shelf behind is blurred 14px under a 60% scrim. A disc spins with a yellow glint above the name (Display) and a Label status line ("Starting through Steam" → "Running" / "Handed off to …"), then everything fades back to the shelf (320ms). Esc returns early.

### Notices
Boxed notices, bottom-center, on Raised with a hairline edge and a 10px radius: an icon, a title in Title weight, a Spec Gray message, and an optional action. Errors take a Recall Red edge and icon.

## Do's and Don'ts

### Do:
- **Do** keep the ground at Shelf Black (#0d0d0f) and let the covers supply color.
- **Do** set every label, head and meta line as condensed caps (Archivo, 72% width, +0.09em) and every game name at normal width.
- **Do** draw keyboard hints as keycaps, in Archivo, never as bare text.
- **Do** print a box front (platform gradient, frame, Box Type title) wherever art is missing, instead of leaving a blank or broken image.
- **Do** keep routine motion at 140–220ms ease-out and save the long, authored motion for the launch.
- **Do** use the 16px gutter as the unit and 24px for the page edge.

### Don't:
- **Don't** introduce a second accent hue; Sticker Yellow is the only one, and Recall Red is reserved for failure.
- **Don't** add barcodes, rating-box pastiche, faux shrinkwrap gloss or other box props; the world is carried by type and rules.
- **Don't** reach for slate panels, a left rail or blue selection (the category default), or for neon glow.
- **Don't** set game names in condensed caps, or labels in normal width.
- **Don't** use monospace for keycaps or numbers; tabular Archivo covers both.
- **Don't** put a kicker or eyebrow above a heading; spec heads carry their own weight.
