import { nativeImage, type NativeImage } from 'electron'
import type { CoverFrame } from '@shared/types'
import { imageExtension, imageSizeFromBuffer } from '../util/imageSize'
import { ambientFromPixels, ambientOfColor } from './ambient'
import { frameForAspect, measureArtwork, padBox } from './framing'

export interface Artwork {
  data: Buffer
  ext: 'png' | 'jpg' | 'gif' | 'webp'
  frame: CoverFrame
  /** A mark's own solid background (#rrggbb), or null. */
  background: string | null
  /** Side of the largest square the visible artwork fills, in pixels. */
  content: number
  /** The glow color the cover suggests (#rrggbb), or null when it is colorless. */
  ambient: string | null
}

/** Downsampled before measuring: a glow color needs no more than this. */
const AMBIENT_SAMPLE_WIDTH = 48

function ambientOf(image: NativeImage): string | null {
  const small = image.getSize().width > AMBIENT_SAMPLE_WIDTH ? image.resize({ width: AMBIENT_SAMPLE_WIDTH, quality: 'good' }) : image
  const { width, height } = small.getSize()
  const data = small.toBitmap()
  // Skia's native order on Windows (and Linux) is BGRA.
  return data.length >= width * height * 4 ? ambientFromPixels({ data, width, height, order: 'bgra' }) : null
}

/** The glow color of an already cached cover (JPEG or PNG), or null. */
export function ambientColor(data: Buffer): string | null {
  const image = nativeImage.createFromBuffer(data)
  return image.isEmpty() ? null : ambientOf(image)
}

/**
 * Looks at an image's pixels to decide how it fills a tile (see framing.ts)
 * and what color a glow around it should take (see ambient.ts). Package logos
 * (Xbox/Store apps) often sit small inside a large transparent or single-color
 * canvas; for those the empty margin is trimmed so the renderer can center the
 * artwork itself on a full-bleed background.
 *
 * Framing decodes only PNGs: JPEGs come from store CDNs and are always art.
 * Every PNG and JPEG is decoded for its ambient color.
 */
export function analyzeArtwork(data: Buffer): Artwork | null {
  const ext = imageExtension(data)
  if (!ext) return null
  if (ext !== 'png') {
    const size = imageSizeFromBuffer(data)
    if (!size) return null
    const frame = frameForAspect(size.width / size.height)
    return { data, ext, frame, background: null, content: Math.min(size.width, size.height), ambient: ext === 'jpg' ? ambientColor(data) : null }
  }

  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  if (bitmap.length < width * height * 4) {
    return { data, ext, frame: frameForAspect(width / height), background: null, content: Math.min(width, height), ambient: null }
  }
  // Skia's native order on Windows (and Linux) is BGRA.
  const layout = measureArtwork({ data: bitmap, width, height, order: 'bgra' })
  if (!layout) return null
  const { frame, box, background, content } = layout
  // A mark on a vivid plate glows in the plate's color when the mark itself is colorless.
  const whole = box.width === width && box.height === height
  const cropped = whole ? image : image.crop(padBox(box, width, height))
  const ambient = ambientOf(cropped) ?? (background ? ambientOfColor(background) : null)
  return { data: whole ? data : cropped.toPNG(), ext, frame, background, content, ambient }
}
