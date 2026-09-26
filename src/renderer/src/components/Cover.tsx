import { memo, useState } from 'react'
import { PLATFORM_LABELS, type Game } from '@shared/types'
import { PlatformMark } from './Icons'

// URLs that have already loaded once, so remounts during virtual scrolling
// show the image at once instead of fading it in again.
const loadedUrls = new Set<string>()

/**
 * The box front for games without art: the platform's colors with the title
 * set like box type, so the wall never shows a broken image.
 */
export const FallbackCover = memo(function FallbackCover({ game }: { game: Game }): React.JSX.Element {
  return (
    <div className={`fallback platform--${game.platform}`}>
      <span className="fallback__frame" aria-hidden="true" />
      <span className="fallback__mark">
        <PlatformMark platform={game.platform} size={24} />
      </span>
      <span className="fallback__name">{game.name}</span>
      <span className="fallback__platform spec">{PLATFORM_LABELS[game.platform]}</span>
    </div>
  )
})

/**
 * Cover art, always filling the whole tile. The main process decides the
 * frame when it caches the image: `art` is cropped to fill; `band` (too wide
 * to crop) spans the width over a blurred copy of itself; `mark` (a logo or
 * icon) sits centered on its own background color, or on a blurred,
 * enlarged copy of itself when it has none.
 */
export const Cover = memo(function Cover({ game }: { game: Game }): React.JSX.Element {
  const url = game.coverImageUrl
  const [loadedUrl, setLoadedUrl] = useState<string | null>(() => (url && loadedUrls.has(url) ? url : null))
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!url || failedUrl === url) return <FallbackCover game={game} />

  const frame = game.coverFrame
  const background = frame === 'mark' ? game.coverBackground : null
  const backdrop = frame === 'band' || (frame === 'mark' && !background)
  const loaded = loadedUrl === url || loadedUrls.has(url)

  return (
    <div
      className={`cover cover--${frame} platform--${game.platform}${background ? ' has-bg' : ''}${loaded ? ' is-loaded' : ''}`}
      style={background ? ({ '--cover-bg': background } as React.CSSProperties) : undefined}
    >
      {backdrop && <img className="cover__backdrop" src={url} alt="" aria-hidden="true" draggable={false} />}
      <img
        className="cover__img"
        src={url}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => {
          loadedUrls.add(url)
          setLoadedUrl(url)
        }}
        onError={() => setFailedUrl(url)}
      />
    </div>
  )
})
