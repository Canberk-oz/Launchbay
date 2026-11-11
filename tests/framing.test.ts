import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameForAspect, measureArtwork, padBox, pickArtwork, type Pixels } from '../src/main/library/framing'

type Rgba = [number, number, number, number]

/** An RGBA image filled with `ground`, with `paint` drawn over the given rectangles. */
function image(width: number, height: number, ground: Rgba, paint: Array<[number, number, number, number, Rgba]> = []): Pixels {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(ground, i * 4)
  for (const [x0, y0, w, h, color] of paint) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set(color, (y * width + x) * 4)
  }
  return { data, width, height, order: 'rgba' }
}

const CLEAR: Rgba = [0, 0, 0, 0]

test('framing: art is cropped to fill unless that would lose too much of it', () => {
  assert.equal(frameForAspect(600 / 900), 'art') // Steam capsule
  assert.equal(frameForAspect(1), 'art') // square tile art keeps 67%
  assert.equal(frameForAspect(0.4), 'art') // very tall: crop top and bottom
  assert.equal(frameForAspect(16 / 9), 'band') // GDK splash art
  assert.equal(frameForAspect(460 / 215), 'band') // Steam header
})

test('framing: a transparent logo is a mark, trimmed to its visible artwork', () => {
  // A UWP splash: 620x300, transparent, a 200x200 logo in the middle.
  const splash = measureArtwork(image(620, 300, CLEAR, [[210, 50, 200, 200, [200, 30, 30, 255]]]))
  assert.deepEqual(splash, { frame: 'mark', box: { x: 210, y: 50, width: 200, height: 200 }, background: null, content: 200 })

  // Transparent corners but art edge to edge (a rounded icon): a mark, untrimmed.
  const rounded = measureArtwork(image(100, 100, [9, 9, 9, 255], [[0, 0, 1, 1, CLEAR], [99, 0, 1, 1, CLEAR], [0, 99, 1, 1, CLEAR], [99, 99, 1, 1, CLEAR]]))
  assert.equal(rounded?.frame, 'mark')
  assert.deepEqual(rounded?.box, { x: 0, y: 0, width: 100, height: 100 })

  assert.equal(measureArtwork(image(50, 50, CLEAR)), null) // nothing visible
})

test('framing: a logo on a flat plate is a mark on that color', () => {
  // "Windows platform sample"-style splash: flat blue, a white wordmark.
  const plate = measureArtwork(image(620, 300, [0, 176, 240, 255], [[60, 100, 500, 80, [255, 255, 255, 255]]]))
  assert.deepEqual(plate, { frame: 'mark', box: { x: 60, y: 100, width: 500, height: 80 }, background: '#00b0f0', content: 80 })

  // BGRA input reports the same color.
  const bgra = image(40, 40, [240, 176, 0, 255], [[10, 10, 5, 5, [255, 255, 255, 255]]])
  assert.equal(measureArtwork({ ...bgra, order: 'bgra' })?.background, '#00b0f0')

  // Art that fills most of a plain-edged canvas stays art (a capsule with a dark sky).
  const dark = measureArtwork(image(300, 450, [10, 10, 10, 255], [[10, 30, 280, 400, [180, 90, 40, 255]]]))
  assert.equal(dark?.frame, 'art')
  assert.equal(dark?.background, null)

  assert.equal(measureArtwork(image(30, 30, [10, 10, 10, 255])), null) // a blank plate
})

test('framing: busy opaque images are art, framed by their shape', () => {
  const noisy = (w: number, h: number): Pixels => {
    const px = image(w, h, [0, 0, 0, 255])
    for (let i = 0; i < w * h; i++) px.data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4)
    return px
  }
  assert.deepEqual(measureArtwork(noisy(310, 310)), { frame: 'art', box: { x: 0, y: 0, width: 310, height: 310 }, background: null, content: 310 })
  assert.equal(measureArtwork(noisy(192, 108))?.frame, 'band')
})

test('framing: trimmed marks keep a small margin inside the image', () => {
  assert.deepEqual(padBox({ x: 210, y: 50, width: 200, height: 200 }, 620, 300), { x: 202, y: 42, width: 216, height: 216 })
  assert.deepEqual(padBox({ x: 0, y: 0, width: 100, height: 50 }, 100, 50), { x: 0, y: 0, width: 100, height: 50 })
})

test('framing: the pick follows the provider tiers, skipping tiny art and pushing bands back', () => {
  const splashMark = { tier: 0, frame: 'mark' as const, content: 240 }
  const largeArt = { tier: 1, frame: 'art' as const, content: 620 }
  const wideArt = { tier: 2, frame: 'band' as const, content: 300 }
  const icon = { tier: 3, frame: 'mark' as const, content: 300 }
  const tinySplash = { tier: 0, frame: 'mark' as const, content: 60 }
  const bandSplash = { tier: 0, frame: 'band' as const, content: 1080 }

  assert.equal(pickArtwork([splashMark, largeArt, wideArt, icon]), 0) // splash first
  assert.equal(pickArtwork([tinySplash, largeArt, icon]), 1) // a tiny splash loses to the large tile
  assert.equal(pickArtwork([bandSplash, largeArt, icon]), 1) // croppable art beats a 16:9 band
  assert.equal(pickArtwork([bandSplash, icon]), 0) // but a band beats a small icon
  assert.equal(pickArtwork([tinySplash, { tier: 3, frame: 'mark', content: 88 }]), 1) // all tiny: the largest
  assert.equal(pickArtwork([wideArt, icon]), 1) // a band wide tile (2 + 2.5) loses to an icon
  assert.equal(pickArtwork([{ tier: 0, frame: 'art', content: 300 }, { tier: 0, frame: 'art', content: 600 }]), 1) // Steam's cache: largest
  assert.equal(pickArtwork([]), -1)
})
