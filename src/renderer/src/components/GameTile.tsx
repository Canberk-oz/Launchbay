import { memo, useRef } from 'react'
import { PLATFORM_LABELS, type Game } from '@shared/types'
import { focusSearch, launchGame, toggleFavorite } from '../actions'
import { formatPlaytime } from '../lib/format'
import { arrowDirection, moveFocus } from '../lib/focus'
import { useTrailerPreview } from '../hooks/useTrailerPreview'
import { Cover } from './Cover'
import { PlatformMark, StarIcon, UpdateIcon } from './Icons'

interface GameTileProps {
  game: Game
  error?: string
  launching: boolean
}

export function tileMeta(game: Game): string {
  const parts = [PLATFORM_LABELS[game.platform]]
  if (game.playtimeMinutes) parts.push(formatPlaytime(game.playtimeMinutes))
  if (game.updateAvailable) parts.push('Update ready')
  return parts.join(' · ')
}

export function handleGameKeys(e: React.KeyboardEvent<HTMLElement>, game: Game, launch: () => void): void {
  const dir = arrowDirection(e.key)
  if (dir) {
    e.preventDefault()
    if (!moveFocus(e.currentTarget, dir) && dir === 'up') focusSearch()
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    launch()
  } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    toggleFavorite(game)
  } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault()
    void window.launchbay.showContextMenu(game.id)
  }
}

export const GameTile = memo(function GameTile({ game, error, launching }: GameTileProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const preview = useTrailerPreview(game)

  const launch = (): void => {
    preview.stop()
    void launchGame(game, host.current)
  }

  const classes = ['tile']
  if (preview.phase !== 'idle') classes.push(`is-${preview.phase}`)
  if (preview.playing) classes.push('is-playing')
  if (game.isFavorite) classes.push('is-favorite')
  if (error) classes.push('is-failed')
  if (launching) classes.push('is-launching')

  return (
    <div
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      data-game-id={game.id}
      aria-label={`${game.name}, ${PLATFORM_LABELS[game.platform]}${game.isFavorite ? ', favorite' : ''}${game.updateAvailable ? ', update ready' : ''}`}
      onPointerEnter={preview.onPointerEnter}
      onPointerLeave={preview.onPointerLeave}
      onClick={launch}
      onKeyDown={(e) => handleGameKeys(e, game, launch)}
      onContextMenu={(e) => {
        e.preventDefault()
        void window.launchbay.showContextMenu(game.id)
      }}
    >
      <div className="tile__frame cover-host" ref={host}>
        <Cover game={game} />
        {preview.src && (
          <video
            className={`tile__video${preview.playing ? ' is-playing' : ''}`}
            src={preview.src}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            {...preview.videoProps}
          />
        )}
        <div className="tile__caption" aria-hidden="true">
          <span className="tile__name">{game.name}</span>
          <span className="tile__meta spec">{tileMeta(game)}</span>
        </div>
        <span className="tile__arm" aria-hidden="true" />
      </div>

      <span className="tile__badge" title={PLATFORM_LABELS[game.platform]} aria-hidden="true">
        <PlatformMark platform={game.platform} size={12} />
      </span>

      {game.updateAvailable && (
        <span className="tile__badge tile__badge--update" title="An update is waiting in Steam" aria-hidden="true">
          <UpdateIcon size={13} />
        </span>
      )}

      <button
        className={`tile__star${game.isFavorite ? ' is-on' : ''}`}
        tabIndex={-1}
        aria-pressed={game.isFavorite}
        aria-label={game.isFavorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
        title={game.isFavorite ? 'Remove from favorites (F)' : 'Add to favorites (F)'}
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite(game)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <StarIcon filled={game.isFavorite} size={15} />
      </button>

      {error && (
        <span className="tile__error" role="status">
          <span className="spec">Couldn’t launch</span>
        </span>
      )}
    </div>
  )
})
