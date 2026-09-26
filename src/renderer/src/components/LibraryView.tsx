import { useEffect, useMemo } from 'react'
import { PLATFORM_LABELS, PLATFORMS } from '@shared/types'
import { openSettings, refreshLibrary } from '../actions'
import { sameCollection } from '@shared/collections'
import { buildSections, filterCollection, platformCounts, type PlatformFilter } from '../lib/library'
import { useStore } from '../store'
import { PlatformMark, RefreshIcon } from './Icons'
import { VirtualGrid } from './VirtualGrid'
import { VirtualList } from './VirtualList'

/** Ghost cells while the very first scan runs: absence, drawn on purpose. */
function ScanningWall(): React.JSX.Element {
  const tileSize = useStore((s) => s.settings.tileSize)
  return (
    <div className="library-scroll">
      <div className="scanning">
        <div className="section-head section-head--static">
          <h2 className="spec section-head__title">Reading your libraries</h2>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="spec section-head__count">Steam · Epic · Xbox</span>
        </div>
        <div className="ghost-wall" style={{ '--tile': `${tileSize}px` } as React.CSSProperties} aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="ghost-tile" style={{ animationDelay: `${(i % 7) * 90}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Empty({
  title,
  body,
  children
}: {
  title: string
  body: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="library-scroll">
      <div className="empty">
        <h2 className="empty__title">{title}</h2>
        <p className="empty__body">{body}</p>
        {children}
      </div>
    </div>
  )
}

export function LibraryView(): React.JSX.Element | null {
  const ready = useStore((s) => s.ready)
  const games = useStore((s) => s.games)
  const search = useStore((s) => s.search)
  const filter = useStore((s) => s.filter)
  const sort = useStore((s) => s.settings.sortMode)
  const viewMode = useStore((s) => s.settings.viewMode)
  const scan = useStore((s) => s.scan)

  const sections = useMemo(() => buildSections(games, { search, filter, sort }), [games, search, filter, sort])
  const counts = useMemo(() => platformCounts(games), [games])
  const resetKey = `${filter}|${search}`
  const collection = filterCollection(filter)
  const collectionGone = collection !== null && !games.some((g) => g.tags.some((t) => sameCollection(t, collection)))

  // The last game left the selected collection: the collection no longer exists.
  useEffect(() => {
    if (collectionGone) useStore.setState({ filter: 'all' })
  }, [collectionGone])

  if (!ready) return null

  if (games.length === 0 && (scan.scanning || scan.lastScanAt === null)) return <ScanningWall />

  if (sections.length === 0) {
    if (search.trim()) {
      return (
        <Empty title={`Nothing matches “${search.trim()}”`} body="Search looks at game names across every platform you have selected.">
          <div className="empty__actions">
            <button className="btn btn--primary" onClick={() => useStore.setState({ search: '' })}>
              Clear search
            </button>
            {filter !== 'all' && (
              <button className="btn" onClick={() => useStore.setState({ filter: 'all' })}>
                Search all games
              </button>
            )}
          </div>
        </Empty>
      )
    }
    if (collection !== null) {
      return (
        <Empty title={`Every game in ${collection} is hidden`} body="Hidden games stay in their collections; they’re just kept off the shelf.">
          <div className="empty__actions">
            <button className="btn btn--primary" onClick={() => useStore.setState({ filter: 'all' })}>
              Show all games
            </button>
            <button className="btn" onClick={openSettings}>
              Manage hidden games
            </button>
          </div>
        </Empty>
      )
    }
    const platform = filter as PlatformFilter
    if (platform !== 'all' && counts[platform] === 0) {
      const hiddenHere = games.some((g) => g.platform === platform && g.isHidden)
      return (
        <Empty
          title={`No ${PLATFORM_LABELS[platform]} games on this PC`}
          body={
            hiddenHere
              ? `Every ${PLATFORM_LABELS[platform]} game here is hidden. You can bring them back in Settings.`
              : `Launchbay didn’t find any installed ${PLATFORM_LABELS[platform]} games. Install one, then refresh the library.`
          }
        >
          <div className="empty__actions">
            <button className="btn btn--primary" onClick={() => useStore.setState({ filter: 'all' })}>
              Show all games
            </button>
            {hiddenHere && (
              <button className="btn" onClick={openSettings}>
                Manage hidden games
              </button>
            )}
          </div>
        </Empty>
      )
    }
    if (games.length > 0) {
      return (
        <Empty title="Every game is hidden" body="Hidden games stay installed; they’re just kept off the shelf.">
          <div className="empty__actions">
            <button className="btn btn--primary" onClick={openSettings}>
              Manage hidden games
            </button>
          </div>
        </Empty>
      )
    }
    return (
      <Empty
        title="No games found on this PC"
        body="Launchbay lists games installed through Steam, the Epic Games Launcher and the Xbox app. Install a game in any of them, then refresh."
      >
        <dl className="spec-table">
          {PLATFORMS.map((p) => (
            <div className="spec-table__row" key={p}>
              <dt className="spec">
                <PlatformMark platform={p} size={13} />
                {PLATFORM_LABELS[p]}
              </dt>
              <dd>Nothing installed</dd>
            </div>
          ))}
        </dl>
        <div className="empty__actions">
          <button className="btn btn--primary" onClick={() => void refreshLibrary()} disabled={scan.scanning}>
            <RefreshIcon size={15} className={scan.scanning ? 'is-spinning' : undefined} />
            {scan.scanning ? 'Scanning…' : 'Refresh library'}
          </button>
        </div>
      </Empty>
    )
  }

  return viewMode === 'grid' ? (
    <VirtualGrid sections={sections} resetKey={resetKey} />
  ) : (
    <VirtualList sections={sections} resetKey={resetKey} />
  )
}
