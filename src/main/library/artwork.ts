import { nativeImage } from 'electron'
import type { CoverFrame } from '@shared/types'
import { imageExtension, imageSizeFromBuffer } from '../util/imageSize'
import { frameForAspect, measureArtwork, padBox } from './framing'

export interface Artwork {
  data: Buffer
  ext: 'png' | 'jpg' | 'gif' | 'webp'
  frame: CoverFrame
  /** A mark's own solid background (#rrggbb), or null. */
  background: string | null
  /** Side of the largest square the visible artwork fills, in pixels. */
  content: number
}

/**
 * Looks at an image's pixels to decide how it fills a tile (see framing.ts).
 * Package logos (Xbox/Store apps) often sit small inside a large transparent
 * or single-color canvas; for those the empty margin is trimmed so the
 * renderer can center the artwork itself on a full-bleed background.
 *
 * Only PNGs are decoded: JPEGs come from store CDNs and are always art.
 */
export function analyzeArtwork(data: Buffer): Artwork | null {
  const ext = imageExtension(data)
  if (!ext) return null
  if (ext !== 'png') {
    const size = imageSizeFromBuffer(data)
    if (!size) return null
    return { data, ext, frame: frameForAspect(size.width / size.height), background: null, content: Math.min(size.width, size.height) }
  }

  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  if (bitmap.length < width * height * 4) {
    return { data, ext, frame: frameForAspect(width / height), background: null, content: Math.min(width, height) }
  }
  // Skia's native order on Windows (and Linux) is BGRA.
  const layout = measureArtwork({ data: bitmap, width, height, order: 'bgra' })
  if (!layout) return null
  const { frame, box, background, content } = layout
  if (box.width === width && box.height === height) return { data, ext, frame, background, content }
  return { data: image.crop(padBox(box, width, height)).toPNG(), ext, frame, background, content }
}
