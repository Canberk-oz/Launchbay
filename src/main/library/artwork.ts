import { nativeImage } from 'electron'
import { imageExtension, imageSizeFromBuffer } from '../util/imageSize'

export interface Artwork {
  data: Buffer
  ext: 'png' | 'jpg' | 'gif' | 'webp'
  /** A transparent logo (clear corners) rather than full-bleed cover art. */
  logo: boolean
  /** Side of the largest square the visible artwork fills, in pixels. */
  content: number
}

const VISIBLE_ALPHA = 24

/**
 * Looks at an image's pixels. Package logos (Xbox/Store apps) often sit small
 * inside a large transparent canvas; this measures the visible artwork, trims
 * the empty margin, and reports whether the image is a transparent logo, so
 * the renderer can print it on a box front instead of floating it in a void.
 */
export function analyzeArtwork(data: Buffer): Artwork | null {
  const ext = imageExtension(data)
  if (!ext) return null
  if (ext !== 'png') {
    const size = imageSizeFromBuffer(data)
    return size ? { data, ext, logo: false, content: Math.min(size.width, size.height) } : null
  }

  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  const pixels = image.toBitmap() // 4 bytes per pixel, alpha last
  if (pixels.length < width * height * 4) return { data, ext, logo: false, content: Math.min(width, height) }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (pixels[(row + x) * 4 + 3] > VISIBLE_ALPHA) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // nothing visible

  const alphaAt = (x: number, y: number): number => pixels[(y * width + x) * 4 + 3]
  const logo = [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)].every(
    (a) => a <= VISIBLE_ALPHA
  )
  const boxW = maxX - minX + 1
  const boxH = maxY - minY + 1
  const content = Math.min(boxW, boxH)
  if (!logo || boxW * boxH > width * height * 0.9) return { data, ext, logo, content }

  const pad = Math.round(Math.max(boxW, boxH) * 0.04)
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const rect = { x, y, width: Math.min(width - x, boxW + pad * 2), height: Math.min(height - y, boxH + pad * 2) }
  return { data: image.crop(rect).toPNG(), ext, logo, content }
}
