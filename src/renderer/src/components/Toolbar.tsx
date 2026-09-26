import { useMemo } from 'react'
import { PLATFORM_LABELS, TILE_SIZE_MAX, TILE_SIZE_MIN, type SortMode } from '@shared/types'
import { refreshLibrary, updateSettings } from '../actions'
import { collectionsOf } from '@shared/collections'
import { collectionFilter, platformCounts, type PlatformFilter } from '../lib/library'
import { useStore } from '../store'
import {
  ChevronDownIcon,
  GridIcon,
  ListIcon,
  PlatformMark,
  RefreshIcon,
  TileLargeIcon,
  TileSmallIcon
} from './Icons'

const FILTERS: PlatformFilter[] = ['all', 'steam', 'epic', 'xbox']

export function Toolbar(): React.JSX.Element {
  const games = useStore((s) => s.games)
  const filter = useStore((s) => s.filter)
  const viewMode = useStore((s) => s.settings.viewMode)
  const tileSize = useStore((s) => s.settings.tileSize)
  const sortMode = useStore((s) => s.settings.sortMode)
  const scanning = useStore((s) => s.scan.scanning)
  const counts = useMemo(() => platformCounts(games), [games])
  const collections = useMemo(() => collectionsOf(games), [games])
  const isList = viewMode === 'list'
  const fill = ((tileSize - TILE_SIZE_MIN) / (TILE_SIZE_MAX - TILE_SIZE_MIN)) * 100

  return (
    <div className="toolbar">
      <div className="filters" role="tablist" aria-label="Filter by store or collection">
        {FILTERS.map((p) => {
          const active = filter === p
          const empty = p !== 'all' && counts[p] === 0
          return (
            <button
              key={p}
              role="tab"
              aria-selected={active}
              className={`pill${active ? ' is-active' : ''}${empty ? ' is-empty' : ''}`}
              onClick={() => useStore.setState({ filter: p })}
              title={empty ? `No ${PLATFORM_LABELS[p as Exclude<PlatformFilter, 'all'>]} games found on this PC` : undefined}
            >
              {p !== 'all' && <PlatformMark platform={p} size={13} />}
              <span className="pill__label">{p === 'all' ? 'All' : PLATFORM_LABELS[p]}</span>
              <span className="pill__count">{counts[p]}</span>
            </button>
          )
        })}
        {collections.length > 0 && <span className="filters__rule" aria-hidden="true" />}
        {collections.map((c) => {
          const value = collectionFilter(c.name)
          const active = filter === value
          return (
            <button
              key={c.name}
              role="tab"
              aria-selected={active}
              className={`pill pill--collection${active ? ' is-active' : ''}${c.count === 0 ? ' is-empty' : ''}`}
              onClick={() => useStore.setState({ filter: value })}
              title={`Collection: ${c.name}`}
            >
              <span className="pill__label">{c.name}</span>
              <span className="pill__count">{c.count}</span>
            </button>
          )
        })}
      </div>

      <div className="toolbar__controls">
        <label className="sort">
          <span className="spec sort__label">Sort</span>
          <span className="sort__field">
            <select
              value={sortMode}
              aria-label="Sort games"
              onChange={(e) => updateSettings({ sortMode: e.target.value as SortMode }, true)}
            >
              <option value="name">Name</option>
              <option value="recent">Recently played</option>
              <option value="size">Size on disk</option>
              <option value="added">Recently added</option>
            </select>
            <ChevronDownIcon size={14} />
          </span>
        </label>

        <div
          className={`size-slider${isList ? ' is-disabled' : ''}`}
          title={isList ? 'Tile size applies to the grid view' : `Tile size (Ctrl + / Ctrl −)`}
        >
          <TileSmallIcon size={16} />
          <input
            type="range"
            min={TILE_SIZE_MIN}
            max={TILE_SIZE_MAX}
            step={4}
            value={tileSize}
            disabled={isList}
            aria-label="Tile size"
            aria-valuetext={`${tileSize} pixels`}
            style={{ '--fill': `${fill}%` } as React.CSSProperties}
            onChange={(e) => updateSettings({ tileSize: Number(e.target.value) })}
          />
          <TileLargeIcon size={16} />
        </div>

        <div className="segmented" role="radiogroup" aria-label="View">
          <button
            role="radio"
            aria-checked={!isList}
            aria-label="Grid view"
            title="Grid view"
            className={!isList ? 'is-active' : ''}
            onClick={() => updateSettings({ viewMode: 'grid' }, true)}
          >
            <GridIcon size={17} />
          </button>
          <button
            role="radio"
            aria-checked={isList}
            aria-label="List view"
            title="List view"
            className={isList ? 'is-active' : ''}
            onClick={() => updateSettings({ viewMode: 'list' }, true)}
          >
            <ListIcon size={17} />
          </button>
        </div>

        <button className="btn refresh" onClick={() => void refreshLibrary()} disabled={scanning} aria-live="polite">
          <RefreshIcon size={15} className={scanning ? 'is-spinning' : undefined} />
          <span>{scanning ? 'Scanning…' : 'Refresh library'}</span>
        </button>
      </div>
    </div>
  )
}
