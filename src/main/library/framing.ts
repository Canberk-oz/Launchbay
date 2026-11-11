// Pure cover-framing decisions: what part of an image is artwork, how it
// should fill a 2:3 tile, and which of several candidate images to keep. No
// Electron imports, so the rules are unit-tested under plain Node.

import type { CoverFrame } from '@shared/types'

/** Width / height of a library tile. */
export const TILE_ASPECT = 2 / 3

/** Cropping art to the tile may drop at most this share of it (a square keeps 67%). */
const MIN_CROP_KEEP = 0.6
const VISIBLE_ALPHA = 24
/** Largest per-channel difference that still counts as the background color. */
const COLOR_TOLERANCE = 20
/** Share of edge pixels that must match for an opaque image to have a plain background. */
const EDGE_UNIFORMITY = 0.97
/** A logo on a solid plate covers well under this share of its canvas. */
const MAX_PLATE_CONTENT = 0.6
/** Transparent art filling more than this share of its canvas is not trimmed. */
const MAX_TRIM_CONTENT = 0.9

/** Artwork smaller than this (its shorter side, in pixels) is only a last resort. */
export const MIN_USABLE_CONTENT = 128
/** Tiers a `band` candidate is pushed back, behind any croppable art or wide logo. */
const BAND_PENALTY = 2.5

export interface Pixels {
  /** 4 bytes per pixel, alpha last. */
  data: Uint8Array
  width: number
  height: number
  order: 'rgba' | 'bgra'
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface ArtworkLayout {
  frame: CoverFrame
  /** The artwork inside the image; the whole image unless it is a mark with margins to trim. */
  box: Box
  /** The mark's own solid background as #rrggbb; null when transparent or not a mark. */
  background: string | null
  /** Shorter side of `box`, in pixels. */
  content: number
}

/** Pure: `art` when cropping to the tile keeps enough of the image, otherwise `band`. */
export function frameForAspect(aspect: number): CoverFrame {
  if (!(aspect > TILE_ASPECT)) return 'art' // portrait art, or narrower still: crop top and bottom
  return TILE_ASPECT / aspect >= MIN_CROP_KEEP ? 'art' : 'band'
}

const hex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

/**
 * Pure: finds the artwork in a decoded image. Transparent images are logos;
 * an opaque image whose edges are one flat color is a logo printed on a plate
 * of that color; anything else is art. Returns null when nothing is visible.
 */
export function measureArtwork(px: Pixels): ArtworkLayout | null {
  const { data, width, height } = px
  if (width < 1 || height < 1 || data.length < width * height * 4) return null
  const [ri, bi] = px.order === 'rgba' ? [0, 2] : [2, 0]
  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3]

  const bounds = (visible: (i: number) => boolean): Box | null => {
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!visible((y * width + x) * 4)) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  }

  const opaqueBox = bounds((i) => data[i + 3] > VISIBLE_ALPHA)
  if (!opaqueBox) return null
  const area = width * height
  const whole: Box = { x: 0, y: 0, width, height }
  const art = (): ArtworkLayout => ({
    frame: frameForAspect(width / height),
    box: whole,
    background: null,
    content: Math.min(width, height)
  })
  const mark = (box: Box, background: string | null): ArtworkLayout => ({
    frame: 'mark',
    box,
    background,
    content: Math.min(box.width, box.height)
  })

  const corners = [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)]
  if (corners.every((a) => a <= VISIBLE_ALPHA)) {
    // A transparent logo. Trim its empty margin unless the art already fills the canvas.
    return mark(opaqueBox.width * opaqueBox.height > area * MAX_TRIM_CONTENT ? whole : opaqueBox, null)
  }

  // Opaque: sample the edges to see whether the image sits on a flat plate.
  const edge: number[] = []
  const step = Math.max(1, Math.floor((width + height) / 400))
  for (let x = 0; x < width; x += step) edge.push(x * 4, ((height - 1) * width + x) * 4)
  for (let y = 0; y < height; y += step) edge.push(y * width * 4, (y * width + width - 1) * 4)
  const r = median(edge.map((i) => data[i + ri]))
  const g = median(edge.map((i) => data[i + 1]))
  const b = median(edge.map((i) => data[i + bi]))
  const differs = (i: number): boolean =>
    Math.abs(data[i + ri] - r) > COLOR_TOLERANCE ||
    Math.abs(data[i + 1] - g) > COLOR_TOLERANCE ||
    Math.abs(data[i + bi] - b) > COLOR_TOLERANCE
  const matching = edge.filter((i) => data[i + 3] >= 250 && !differs(i)).length
  if (matching < edge.length * EDGE_UNIFORMITY) return art()

  const content = bounds((i) => data[i + 3] > VISIBLE_ALPHA && differs(i))
  if (!content) return null // one flat color, nothing drawn on it
  if (content.width * content.height > area * MAX_PLATE_CONTENT) return art()
  return mark(content, hex(r, g, b))
}

/** Pure: `box` grown by a small margin on every side, kept inside the image. */
export function padBox(box: Box, width: number, height: number): Box {
  const pad = Math.round(Math.max(box.width, box.height) * 0.04)
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  return { x, y, width: Math.min(width - x, box.width + pad * 2), height: Math.min(height - y, box.height + pad * 2) }
}

export interface ArtworkCandidate {
  /** Lower is preferred: the order the provider ranks its asset kinds in. */
  tier: number
  frame: CoverFrame
  content: number
}

/**
 * Pure: the index of the candidate to use. Among candidates big enough to look
 * sharp, the provider's preference wins (art that would only show as a band is
 * pushed back), then the larger artwork. When every candidate is small, the
 * largest one wins.
 */
export function pickArtwork(candidates: ArtworkCandidate[]): number {
  const key = (c: ArtworkCandidate): [number, number, number] =>
    c.content >= MIN_USABLE_CONTENT
      ? [0, c.tier + (c.frame === 'band' ? BAND_PENALTY : 0), -c.content]
      : [1, 0, -c.content]
  let best = -1
  for (let i = 0; i < candidates.length; i++) {
    if (best < 0) {
      best = i
      continue
    }
    const a = key(candidates[i])
    const b = key(candidates[best])
    if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) best = i
  }
  return best
}
