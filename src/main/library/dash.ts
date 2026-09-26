// Minimal MPEG-DASH (MPD) reader: enough to turn a Steam trailer manifest into
// the URLs of one video representation's init segment and first N media
// segments. Concatenated, those form a fragmented MP4 that <video> can play
// straight from disk, with no MSE player and no audio (previews are muted).

import { XMLParser } from 'fast-xml-parser'

export interface DashPreviewPlan {
  initUrl: string
  segmentUrls: string[]
  width: number
  height: number
  bandwidth: number
  mimeType: string
}

export interface DashPlanOptions {
  /** Prefer the smallest representation at least this tall. */
  targetHeight: number
  /** Roughly how many seconds of video to take. */
  maxSeconds: number
  /** Skip this many seconds from the start (logos, black frames) when the video is long enough. */
  skipSeconds?: number
}

type Node = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['Period', 'AdaptationSet', 'Representation', 'S', 'BaseURL'].includes(name)
})

/** Pure: ISO-8601 duration (PT1H2M3.5S) to seconds. */
export function parseIsoDuration(value: unknown): number {
  if (typeof value !== 'string') return 0
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim())
  if (!m) return 0
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0))
  return d * 86400 + h * 3600 + min * 60 + s
}

/** Pure: expands $RepresentationID$, $Number%05d$, $Time$, $Bandwidth$ and $$. */
export function expandTemplate(template: string, vars: { RepresentationID: string; Number?: number; Time?: number; Bandwidth?: number }): string {
  return template.replace(/\$(RepresentationID|Number|Time|Bandwidth|)(?:%0(\d+)d)?\$/g, (_all, name: string, width?: string) => {
    if (name === '') return '$'
    const value = vars[name as keyof typeof vars]
    if (value === undefined) return ''
    const str = String(value)
    return width ? str.padStart(Number(width), '0') : str
  })
}

function baseUrlOf(node: Node | undefined, parentBase: string): string {
  const list = node?.BaseURL as unknown[] | undefined
  const first = list?.[0]
  const text = typeof first === 'string' ? first : first && typeof first === 'object' ? String((first as Node)['#text'] ?? '') : ''
  return text ? new URL(text, parentBase).href : parentBase
}

function isVideoSet(set: Node, reps: Node[]): boolean {
  const type = String(set.contentType ?? '')
  const mime = String(set.mimeType ?? reps[0]?.mimeType ?? '')
  return type === 'video' || mime.startsWith('video/')
}

interface Box {
  type: string
  start: number
  headerSize: number
  size: number
}

function readBoxes(buf: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = []
  let off = start
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    let headerSize = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(off + 8))
      headerSize = 16
    } else if (size === 0) {
      size = end - off
    }
    if (size < headerSize || off + size > end) break
    boxes.push({ type, start: off, headerSize, size })
    off += size
  }
  return boxes
}

/**
 * Pure: prepares media segments taken from the middle of a DASH stream for
 * playback as one standalone file. Drops the per-segment `styp`/`sidx` boxes
 * and shifts every `tfdt` decode time (per track) so the first kept fragment
 * starts at zero; the result loops cleanly as a 0-based fragmented MP4.
 */
export function rebaseFragments(segments: Buffer[]): Buffer[] {
  const bases = new Map<number, bigint>()
  return segments.map((segment) => {
    const buf = Buffer.from(segment) // copy: callers may reuse the input
    const kept: Buffer[] = []
    for (const box of readBoxes(buf, 0, buf.length)) {
      if (box.type === 'styp' || box.type === 'sidx') continue
      if (box.type === 'moof') {
        for (const traf of readBoxes(buf, box.start + box.headerSize, box.start + box.size)) {
          if (traf.type !== 'traf') continue
          const children = readBoxes(buf, traf.start + traf.headerSize, traf.start + traf.size)
          const tfhd = children.find((c) => c.type === 'tfhd')
          const tfdt = children.find((c) => c.type === 'tfdt')
          if (!tfhd || !tfdt) continue
          const trackId = buf.readUInt32BE(tfhd.start + tfhd.headerSize + 4)
          const at = tfdt.start + tfdt.headerSize
          const version = buf[at]
          const time = version === 1 ? buf.readBigUInt64BE(at + 4) : BigInt(buf.readUInt32BE(at + 4))
          if (!bases.has(trackId)) bases.set(trackId, time)
          const rebased = time - bases.get(trackId)!
          if (version === 1) buf.writeBigUInt64BE(rebased < 0n ? 0n : rebased, at + 4)
          else buf.writeUInt32BE(Number(rebased < 0n ? 0n : rebased), at + 4)
        }
      }
      kept.push(buf.subarray(box.start, box.start + box.size))
    }
    return Buffer.concat(kept)
  })
}

/** Pure: plans which segments to fetch for a short muted preview. */
export function planDashPreview(mpdXml: string, mpdUrl: string, options: DashPlanOptions): DashPreviewPlan | null {
  const doc = parser.parse(mpdXml) as { MPD?: Node }
  const mpd = doc.MPD
  if (!mpd) return null
  const totalSeconds = parseIsoDuration(mpd.mediaPresentationDuration)
  const period = (mpd.Period as Node[] | undefined)?.[0]
  if (!period) return null

  const mpdBase = baseUrlOf(mpd, mpdUrl)
  const periodBase = baseUrlOf(period, mpdBase)

  const candidates: Array<{ set: Node; rep: Node; base: string }> = []
  for (const set of (period.AdaptationSet as Node[] | undefined) ?? []) {
    const reps = (set.Representation as Node[] | undefined) ?? []
    if (!isVideoSet(set, reps)) continue
    const setBase = baseUrlOf(set, periodBase)
    for (const rep of reps) candidates.push({ set, rep, base: baseUrlOf(rep, setBase) })
  }
  if (candidates.length === 0) return null

  const height = (c: { rep: Node }): number => Number(c.rep.height ?? 0)
  const bandwidth = (c: { rep: Node }): number => Number(c.rep.bandwidth ?? 0)
  const tallEnough = candidates.filter((c) => height(c) >= options.targetHeight).sort((a, b) => height(a) - height(b) || bandwidth(a) - bandwidth(b))
  const chosen = tallEnough[0] ?? [...candidates].sort((a, b) => height(b) - height(a))[0]

  const template = (chosen.rep.SegmentTemplate ?? chosen.set.SegmentTemplate) as Node | undefined
  if (!template || typeof template.media !== 'string') return null
  const repId = String(chosen.rep.id ?? '')
  const repBandwidth = bandwidth(chosen)
  const timescale = Number(template.timescale ?? 1) || 1
  const startNumber = Number(template.startNumber ?? 1)

  // Build the full segment list as (number, time, seconds).
  const segments: Array<{ number: number; time: number; seconds: number }> = []
  const timeline = (template.SegmentTimeline as Node | undefined)?.S as Node[] | undefined
  if (timeline?.length) {
    let time = 0
    let number = startNumber
    for (const s of timeline) {
      if (s.t !== undefined) time = Number(s.t)
      const d = Number(s.d)
      let repeat = Number(s.r ?? 0)
      if (repeat < 0) repeat = totalSeconds > 0 ? Math.max(0, Math.ceil((totalSeconds * timescale - time) / d) - 1) : 0
      for (let k = 0; k <= repeat; k++) {
        segments.push({ number: number++, time, seconds: d / timescale })
        time += d
      }
    }
  } else if (template.duration !== undefined) {
    const segSeconds = Number(template.duration) / timescale
    if (!(segSeconds > 0) || !(totalSeconds > 0)) return null
    const count = Math.ceil(totalSeconds / segSeconds - 1e-9)
    for (let k = 0; k < count; k++) {
      segments.push({ number: startNumber + k, time: Math.round(k * Number(template.duration)), seconds: segSeconds })
    }
  } else {
    return null
  }
  if (segments.length === 0) return null

  // Choose the preview window.
  let startIndex = 0
  const skip = options.skipSeconds ?? 0
  if (skip > 0 && totalSeconds >= skip + options.maxSeconds) {
    let acc = 0
    while (startIndex < segments.length - 1 && acc + segments[startIndex].seconds <= skip) {
      acc += segments[startIndex].seconds
      startIndex++
    }
  }
  const picked: typeof segments = []
  let seconds = 0
  for (let k = startIndex; k < segments.length && seconds < options.maxSeconds; k++) {
    picked.push(segments[k])
    seconds += segments[k].seconds
  }

  const vars = { RepresentationID: repId, Bandwidth: repBandwidth }
  const initTemplate = typeof template.initialization === 'string' ? template.initialization : null
  if (!initTemplate) return null

  return {
    initUrl: new URL(expandTemplate(initTemplate, vars), chosen.base).href,
    segmentUrls: picked.map((s) => new URL(expandTemplate(template.media as string, { ...vars, Number: s.number, Time: s.time }), chosen.base).href),
    width: Number(chosen.rep.width ?? 0),
    height: height(chosen),
    bandwidth: repBandwidth,
    mimeType: String(chosen.rep.mimeType ?? chosen.set.mimeType ?? 'video/mp4')
  }
}
