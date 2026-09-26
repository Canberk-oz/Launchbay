import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandTemplate, parseIsoDuration, planDashPreview, rebaseFragments } from '../src/main/library/dash'
import { pickTrailer } from '../src/main/providers/steamScan'

// Shape of a real Steam store trailer manifest (2025+).
const MPD = `<?xml version='1.0' encoding='utf-8'?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT2M22.0S" maxSegmentDuration="PT3.0S" minBufferTime="PT6.0S">
  <Period id="0" start="PT0.0S">
    <AdaptationSet id="0" contentType="video" startWithSAP="1" segmentAlignment="true" bitstreamSwitching="true" frameRate="24/1" maxWidth="700" maxHeight="394" par="350:197">
      <Representation id="0" mimeType="video/mp4" codecs="avc1.640029" bandwidth="1400000" width="700" height="394" sar="1:1">
        <SegmentTemplate timescale="1000000" duration="3000000" initialization="dash_h264/init-stream$RepresentationID$.m4s" media="dash_h264/chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1"></SegmentTemplate>
      </Representation>
      <Representation id="1" mimeType="video/mp4" codecs="avc1.640029" bandwidth="1000000" width="640" height="360" sar="1575:1576">
        <SegmentTemplate timescale="1000000" duration="3000000" initialization="dash_h264/init-stream$RepresentationID$.m4s" media="dash_h264/chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1"></SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="1" contentType="audio" startWithSAP="1" segmentAlignment="true" bitstreamSwitching="true">
      <Representation id="2" mimeType="audio/mp4" codecs="mp4a.40.2" bandwidth="192000" audioSamplingRate="48000">
        <SegmentTemplate timescale="1000000" duration="3000000" initialization="dash_h264/init-stream$RepresentationID$.m4s" media="dash_h264/chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1"></SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="2" mimeType="image/avif" contentType="image">
      <SegmentTemplate media="$RepresentationID$/thumbnails-$Number%05d$.avif" duration="90" startNumber="1" />
      <Representation id="dash_thumbnails" bandwidth="0" width="1275" height="864" />
    </AdaptationSet>
  </Period>
</MPD>`
const URL_BASE = 'https://video.akamai.steamstatic.com/store_trailers/400/336/abc/1750108766/dash_h264.mpd?t=1682715059'

test('parses ISO durations and expands templates', () => {
  assert.equal(parseIsoDuration('PT2M22.0S'), 142)
  assert.equal(parseIsoDuration('PT1H0M1.5S'), 3601.5)
  assert.equal(expandTemplate('a-$RepresentationID$-$Number%05d$-$$', { RepresentationID: '1', Number: 7 }), 'a-1-00007-$')
})

test('plans a video-only preview from a Steam manifest', () => {
  const plan = planDashPreview(MPD, URL_BASE, { targetHeight: 360, maxSeconds: 30 })
  assert.ok(plan)
  assert.equal(plan.height, 360) // smallest representation at least 360 tall
  assert.equal(plan.initUrl, 'https://video.akamai.steamstatic.com/store_trailers/400/336/abc/1750108766/dash_h264/init-stream1.m4s')
  assert.equal(plan.segmentUrls.length, 10) // 10 × 3s = 30s
  assert.match(plan.segmentUrls[0], /chunk-stream1-00001\.m4s$/)

  const tall = planDashPreview(MPD, URL_BASE, { targetHeight: 1080, maxSeconds: 30 })
  assert.equal(tall?.height, 394) // nothing that tall: take the largest

  const skipped = planDashPreview(MPD, URL_BASE, { targetHeight: 360, maxSeconds: 30, skipSeconds: 6 })
  assert.match(skipped!.segmentUrls[0], /chunk-stream1-00003\.m4s$/)
})

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length)
  header.write(type, 4, 'ascii')
  return Buffer.concat([header, payload])
}

function segment(trackId: number, decodeTime: bigint): Buffer {
  const tfhd = Buffer.alloc(8)
  tfhd.writeUInt32BE(trackId, 4)
  const tfdt = Buffer.alloc(12)
  tfdt[0] = 1 // version 1: 64-bit time
  tfdt.writeBigUInt64BE(decodeTime, 4)
  const traf = box('traf', Buffer.concat([box('tfhd', tfhd), box('tfdt', tfdt)]))
  return Buffer.concat([box('styp', Buffer.alloc(4)), box('sidx', Buffer.alloc(24)), box('moof', traf), box('mdat', Buffer.alloc(16))])
}

test('rebases mid-stream fragments to start at zero and drops per-segment indexes', () => {
  const [first, second] = rebaseFragments([segment(1, 73728n), segment(1, 110592n)])
  const types = (buf: Buffer): string[] => {
    const out: string[] = []
    for (let off = 0; off < buf.length; off += buf.readUInt32BE(off)) out.push(buf.toString('ascii', off + 4, off + 8))
    return out
  }
  assert.deepEqual(types(first), ['moof', 'mdat'])
  const tfdtTime = (buf: Buffer): bigint => buf.readBigUInt64BE(buf.indexOf('tfdt') + 4 + 4)
  assert.equal(tfdtTime(first), 0n)
  assert.equal(tfdtTime(second), 36864n)
})

test('picks trailers from both appdetails shapes', () => {
  assert.deepEqual(pickTrailer([{ id: 1, highlight: true, mp4: { '480': 'https://x/movie480.mp4', max: 'https://x/max.mp4' } }]), {
    kind: 'progressive',
    url: 'https://x/movie480.mp4'
  })
  assert.deepEqual(
    pickTrailer([
      { id: 2, highlight: false, dash_h264: 'https://x/other.mpd' },
      { id: 1, highlight: true, dash_av1: 'https://x/av1.mpd', dash_h264: 'https://x/h264.mpd', hls_h264: 'https://x/a.m3u8' }
    ]),
    { kind: 'dash', url: 'https://x/h264.mpd' }
  )
  assert.equal(pickTrailer([]), null)
  assert.equal(pickTrailer(undefined), null)
})
