import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { PLATFORM_LABELS, type Game, type SortMode } from '@shared/types'
import { launchGame, toggleFavorite, updateSettings } from '../actions'
import { formatBytes, formatPlaytime, formatRelative, formatWhen } from '../lib/format'
import type { Section } from '../lib/library'
import { useStore } from '../store'
import { Cover } from './Cover'
import { handleGameKeys } from './GameTile'
import { PlatformMark, StarIcon } from './Icons'
import { SectionHead } from './SectionHead'

const ROW = 56
const HEAD_FIRST = 44
const HEAD = 60
const BOTTOM = 40

type Row = { kind: 'head'; key: string; section: Section } | { kind: 'game'; key: string; game: Game }

const GameRow = memo(function GameRow({ game, error }: { game: Game; error?: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const launch = (): void => void launchGame(game, host.current)
  return (
    <div
      className={`row${error ? ' is-failed' : ''}${game.isFavorite ? ' is-favorite' : ''}`}
      role="row"
      tabIndex={0}
      data-game-id={game.id}
      aria-label={`${game.name}, ${PLATFORM_LABELS[game.platform]}`}
      onClick={launch}
      onKeyDown={(e) => handleGameKeys(e, game, launch)}
      onContextMenu={(e) => {
        e.preventDefault()
        void window.launchbay.showContextMenu(game.id)
      }}
    >
      <div className="row__thumb cover-host" ref={host} role="cell">
        <Cover game={game} />
      </div>
      <div className="row__name" role="cell">
        <span className="row__title">{game.name}</span>
        {error && <span className="row__error spec">Couldn’t launch</span>}
      </div>
      <div className="row__platform" role="cell">
        <PlatformMark platform={game.platform} size={13} />
        <span>{PLATFORM_LABELS[game.platform]}</span>
      </div>
      <div className="row__num" role="cell">
        {formatPlaytime(game.playtimeMinutes)}
      </div>
      <div className="row__num" role="cell">
        {formatBytes(game.sizeOnDisk)}
      </div>
      <div className="row__num row__when" role="cell">
        {formatRelative(game.lastPlayed)}
      </div>
      <div className="row__num row__added" role="cell">
        {formatWhen(game.addedAt)}
      </div>
      <div role="cell" className="row__fav">
        <button
          className={`row__star${game.isFavorite ? ' is-on' : ''}`}
          tabIndex={-1}
          aria-pressed={game.isFavorite}
          aria-label={game.isFavorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(game)
          }}
        >
          <StarIcon filled={game.isFavorite} size={15} />
        </button>
      </div>
    </div>
  )
})

function HeaderCell({ label, sort, align }: { label: string; sort?: SortMode; align?: 'end' }): React.JSX.Element {
  const current = useStore((s) => s.settings.sortMode)
  if (!sort) return <div role="columnheader" className={`list-head__cell spec${align ? ' is-end' : ''}`}>{label}</div>
  return (
    <div
      role="columnheader"
      aria-sort={current === sort ? (sort === 'name' ? 'ascending' : 'descending') : 'none'}
      className={`list-head__cell${align ? ' is-end' : ''}`}
    >
      <button className={`spec list-head__sort${current === sort ? ' is-active' : ''}`} onClick={() => updateSettings({ sortMode: sort }, true)}>
        {label}
      </button>
    </div>
  )
}

/** The spec table: dense rows for scanning names fast. */
export function VirtualList({ sections, resetKey }: { sections: Section[]; resetKey: string }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tileErrors = useStore((s) => s.tileErrors)
  const sortMode = useStore((s) => s.settings.sortMode)
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const section of sections) {
      out.push({ kind: 'head', key: `head:${section.key}`, section })
      for (const game of section.games) out.push({ kind: 'game', key: `${section.key}:${game.id}`, game })
    }
    return out
  }, [sections])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === 'head' ? (i === 0 ? HEAD_FIRST : HEAD) : ROW),
    getItemKey: (i) => rows[i].key,
    overscan: 8
  })

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [resetKey])

  return (
    <div
      className={`library-scroll library-scroll--list${sortMode === 'added' ? ' is-sorted-by-added' : ''}`}
      ref={scrollRef}
      role="table"
      aria-label="Games"
    >
      <div className="list-head" role="row">
        <div role="columnheader" aria-label="Cover" />
        <HeaderCell label="Name" sort="name" />
        <HeaderCell label="Platform" />
        <HeaderCell label="Playtime" align="end" />
        <HeaderCell label="Size" sort="size" align="end" />
        <HeaderCell label="Last played" sort="recent" align="end" />
        <HeaderCell label="Added" sort="added" align="end" />
        <div role="columnheader" aria-label="Favorite" />
      </div>
      <div className="list-canvas" style={{ height: virtualizer.getTotalSize() + BOTTOM }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          const style = { transform: `translateY(${item.start}px)`, height: item.size }
          return row.kind === 'head' ? (
            <SectionHead key={item.key} section={row.section} style={{ ...style, left: 24, right: 24 }} />
          ) : (
            <div key={item.key} className="list-slot" style={style}>
              <GameRow game={row.game} error={tileErrors[row.game.id]} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
