---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/index.html"]
---

# Library window (renderer)

Scope: the whole Launchbay renderer, meaning the title strip, toolbar, cover grid and list, launch transition, hover preview, settings panel and toasts. Visitor mode: **Operate**.

Audience and job: one Windows player finds an installed game from any store and starts it in seconds, whether browsing or summoning the overlay (both weigh equally).
Proof and content: real covers from Steam, Epic and Xbox. When art is missing, a designed box front appears instead. Counts per store show that the library is complete.
Constraints: follow the user spec; near-black #0d0d0f is pinned; 2:3 tiles; the tile-size slider runs 100–320 px; 500+ games must stay smooth.

Chosen direction: **Back of the Box**. Memorable moment: the launch, when the cover lifts off the shelf and fills the window.

Unresolved: none.

## Direction contract

THESIS: every installed game stands face-out on one shelf, and the chrome is set like the spec block on the back of a PC game box. It refuses the slate-panel, left-rail, blue-accent launcher and the neon-glow dashboard.

OWN-WORLD: #0d0d0f ground with a #151518 second layer and hairline rules. Paper-white type (#ecebe6) with muted gray (#8f8f98), and one sticker yellow (#ffcc33) only for favorites, focus and primary action. Archivo condensed caps for labels and heads, normal width for names, tabular figures everywhere. Spec tables, drawn keycaps, capsule filters with count chips that invert when active, a foil star sticker, and boxed platform badges. Raises: absence drawn as ghost cells; achromatic chrome; distinct idle, armed, previewing, launching and failed states; gutter-unit alignment; whole-tile reflow.

STORY: the user sees every store's games together, trusts the counts, types or scrolls, and launches in one click. Failures state what happened.

FIRST VIEWPORT: a 44px strip holding the LAUNCHBAY wordmark and search with a Ctrl F keycap. A 48px toolbar with filters on the left and sort, size, view and refresh on the right. Below it, "FAVORITES" as a ruled spec header with its count, a row of covers, then "ALL GAMES" and the full wall. Clicking a cover launches it.

FORM: Back of the Box, position 5 of 7, seed edaec6bb. Signature: the cover expands, blurs and dims into a disc loader with a "LAUNCHING via Steam" spec line. Motion: 150–200ms ease-out, launch 480ms expo-out, exits faster.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
