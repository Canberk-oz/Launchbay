import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambientFromPixels, ambientOfColor } from '../src/main/library/ambient'
import type { Pixels } from '../src/main/library/framing'

type Rgba = [number, number, number, number]
/** An RGBA image made of horizontal bands: [color, share of rows]. */
function bands(parts: Array<[Rgba, number]>, width = 20, height = 100): Pixels {
  const data = new Uint8Array(width * height * 4)
  let y = 0
  for (const [color, share] of parts) {
    const rows = Math.round(height * share)
    for (let r = 0; r < rows && y < height; r++, y++) for (let x = 0; x < width; x++) data.set(color, (y * width + x) * 4)
  }
  return { data, width, height, order: 'rgba' }
}
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

test('ambient: the vivid hue wins over a larger dark or gray area', () => {
  const c = ambientFromPixels(bands([[[10, 10, 12, 255], 0.6], [[120, 120, 120, 255], 0.25], [[230, 60, 20, 255], 0.15]]))
  assert.ok(c)
  assert.ok(hue(c) < 30, `expected an orange-red, got ${c}`)
})

test('ambient: colorless covers get no glow', () => {
  assert.equal(ambientFromPixels(bands([[[20, 20, 20, 255], 0.5], [[200, 200, 200, 255], 0.5]])), null)
  assert.equal(ambientFromPixels(bands([[[0, 0, 0, 0], 1]])), null) // fully transparent
  assert.equal(ambientOfColor('#808080'), null)
})

test('ambient: output is clamped to a glow-friendly lightness and saturation', () => {
  const dark = ambientFromPixels(bands([[[20, 40, 90, 255], 1]]))! // a dim navy
  const neon = ambientFromPixels(bands([[[0, 255, 0, 255], 1]]))! // pure green
  for (const c of [dark, neon]) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16) / 255)
    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2
    assert.ok(l >= 0.45 && l <= 0.63, `${c} lightness ${l}`)
  }
  assert.ok(Math.abs(hue(dark) - 222) < 12, `navy stays blue: ${dark}`)
  assert.ok(Math.abs(hue(neon) - 120) < 5, `green stays green: ${neon}`)
  assert.equal(ambientOfColor('#1d2b53') !== null, true)
  assert.equal(ambientOfColor('black'), null) // named colors are not measured
})

test('ambient: BGRA input reads the same color as RGBA', () => {
  const rgba = bands([[[230, 60, 20, 255], 1]])
  const bgra = bands([[[20, 60, 230, 255], 1]])
  assert.equal(ambientFromPixels({ ...bgra, order: 'bgra' }), ambientFromPixels(rgba))
})
