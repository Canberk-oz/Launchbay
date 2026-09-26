// A cover's ambient color: the hue a glow around it should take. Pure, so it
// is unit-tested under plain Node.

import type { Pixels } from './framing'

const HUE_BINS = 18
/** Pixels darker than this, or grayer than this, carry no usable hue. */
const MIN_VALUE = 0.15
const MIN_SATURATION = 0.2
/** A cover whose vivid pixels weigh less than this share of it is treated as colorless. */
const MIN_VIVID_SHARE = 0.04

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h, max === 0 ? 0 : d / max, max / 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [rgbToHsv(r, g, b)[0], s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x]
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Pure: the dominant vivid hue of an image as a glow color (#rrggbb), or null
 * when the image is essentially colorless (grays, black, white). Hues are
 * binned and weighted by saturation and brightness, so a small bright accent
 * doesn't lose to a large murky background; the winning hue family's average
 * is then clamped to a lightness and saturation that read as a glow on the
 * near-black shelf rather than as mud or neon.
 */
export function ambientFromPixels(px: Pixels): string | null {
  const { data, width, height } = px
  const [ri, bi] = px.order === 'rgba' ? [0, 2] : [2, 0]
  const bins = Array.from({ length: HUE_BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  let opaque = 0
  let vivid = 0
  for (let i = 0; i < width * height * 4; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue
    opaque++
    const r = data[i + ri]
    const g = data[i + 1]
    const b = data[i + bi]
    const [h, s, v] = rgbToHsv(r, g, b)
    if (v < MIN_VALUE || s < MIN_SATURATION) continue
    const w = s * v
    const bin = bins[Math.min(HUE_BINS - 1, Math.floor(h * HUE_BINS))]
    bin.w += w
    bin.r += r * w
    bin.g += g * w
    bin.b += b * w
    vivid += w
  }
  if (opaque === 0 || vivid < opaque * MIN_VIVID_SHARE) return null

  // A hue family: a bin plus half of each neighbor, so hues on a bin edge aren't split.
  let best = 0
  let bestScore = -1
  for (let i = 0; i < HUE_BINS; i++) {
    const score = bins[i].w + 0.5 * (bins[(i + HUE_BINS - 1) % HUE_BINS].w + bins[(i + 1) % HUE_BINS].w)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  const family = [bins[(best + HUE_BINS - 1) % HUE_BINS], bins[best], bins[(best + 1) % HUE_BINS]]
  const w = family.reduce((sum, bin) => sum + bin.w, 0)
  const [h, s, l] = rgbToHsl(
    family.reduce((sum, bin) => sum + bin.r, 0) / w,
    family.reduce((sum, bin) => sum + bin.g, 0) / w,
    family.reduce((sum, bin) => sum + bin.b, 0) / w
  )
  return hslToHex(h, Math.min(0.85, Math.max(0.4, s)), Math.min(0.62, Math.max(0.46, l)))
}

/** Pure: the glow for a flat color (a mark's plate), clamped like artwork; null for grays. */
export function ambientOfColor(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return ambientFromPixels({ data: new Uint8Array([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255]), width: 1, height: 1, order: 'rgba' })
}
