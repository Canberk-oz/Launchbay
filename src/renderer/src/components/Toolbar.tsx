import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

/**
 * The filter row scrolls sideways when the pills don't fit (many collections,
 * a narrow window). This makes that reachable and visible: the wheel scrolls
 * it, the selected pill is kept in view, and `edges` says which sides have
 * more so the row can fade there.
 */
function useScrollableRow(deps: unknown[]): { ref: React.RefObject<HTMLDivElement | null>; edges: { start: boolean; end: boolean } } {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
    }
    // `deps` lists what changes the row's content (its width is observed).
  }, deps)

  return { ref, edges }
}

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
  const row = useScrollableRow([collections.length])

  // Picking a filter (or having one picked: a collection made from Properties) keeps its pill in view.
  useEffect(() => {
    row.ref.current?.querySelector('.pill.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [filter, row.ref])

  return (
    <div className="toolbar">
      <div
        ref={row.ref}
        className={`filters${row.edges.start ? ' has-more-start' : ''}${row.edges.end ? ' has-more-end' : ''}`}
        role="group"
        aria-label="Filter by store or collection"
      >
        {FILTERS.map((p) => {
          const active = filter === p
          const empty = p !== 'all' && counts[p] === 0
          return (
            <button
              key={p}
              aria-pressed={active}
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
              aria-pressed={active}
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
