import { memo, useEffect, useState } from 'react'
import { PLATFORM_LABELS, type Game } from '@shared/types'
import { PlatformMark } from './Icons'

type Fit = 'portrait' | 'wide'

// Remembered per URL so remounts during virtual scrolling render in the right
// fit immediately, with no fade.
const fitCache = new Map<string, Fit>()

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
 * Cover art. Portrait art (Steam's 600×900 capsule, Epic's tall box art) fills
 * the tile; anything wider (Steam header fallbacks, Xbox logo tiles) is
 * contained over a blurred copy of itself on the platform's colors.
 */
export const Cover = memo(function Cover({ game }: { game: Game }): React.JSX.Element {
  const url = game.coverImageUrl
  const [fit, setFit] = useState<Fit | null>(() => (url ? (fitCache.get(url) ?? null) : null))
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  useEffect(() => {
    setFit(url ? (fitCache.get(url) ?? null) : null)
  }, [url])

  if (!url || failedUrl === url) return <FallbackCover game={game} />

  // Transparent package logos are printed on a box front with the title set below.
  if (game.coverIsLogo) {
    return (
      <div className={`fallback fallback--logo platform--${game.platform}`}>
        <span className="fallback__frame" aria-hidden="true" />
        <img className="fallback__logo" src={url} alt="" draggable={false} decoding="async" onError={() => setFailedUrl(url)} />
        <span className="fallback__name">{game.name}</span>
        <span className="fallback__platform spec">{PLATFORM_LABELS[game.platform]}</span>
      </div>
    )
  }

  return (
    <div className={`cover platform--${game.platform}${fit ? ` cover--${fit} is-loaded` : ''}`}>
      {fit === 'wide' && <img className="cover__backdrop" src={url} alt="" aria-hidden="true" draggable={false} />}
      <img
        className="cover__img"
        src={url}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget
          const next: Fit = img.naturalWidth / Math.max(1, img.naturalHeight) < 0.8 ? 'portrait' : 'wide'
          fitCache.set(url, next)
          setFit(next)
        }}
        onError={() => setFailedUrl(url)}
      />
    </div>
  )
})
