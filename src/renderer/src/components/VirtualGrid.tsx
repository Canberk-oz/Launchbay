import { useLayoutEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Game } from '@shared/types'
import type { Section } from '../lib/library'
import { useElementWidth } from '../hooks/useElementWidth'
import { useStore } from '../store'
import { GameTile } from './GameTile'
import { SectionHead } from './SectionHead'

const GAP = 16 // the base unit
const EDGE = 24
const HEAD_FIRST = 52
const HEAD = 68
const BOTTOM = 40

type Row =
  | { kind: 'head'; key: string; section: Section }
  | { kind: 'tiles'; key: string; games: Game[] }

function buildRows(sections: Section[], columns: number): Row[] {
  const rows: Row[] = []
  for (const section of sections) {
    rows.push({ kind: 'head', key: `head:${section.key}`, section })
    for (let i = 0; i < section.games.length; i += columns) {
      rows.push({ kind: 'tiles', key: `${section.key}:${i / columns}`, games: section.games.slice(i, i + columns) })
    }
  }
  return rows
}

/**
 * The cover wall. Rows are virtualized so a 500+ game library only mounts what
 * is on screen. Tiles stretch to fill whole columns: the slider sets the target
 * width and the grid picks the column count that lands closest to it.
 */
export function VirtualGrid({ sections, resetKey }: { sections: Section[]; resetKey: string }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(scrollRef)
  const tileSize = useStore((s) => s.settings.tileSize)
  const tileErrors = useStore((s) => s.tileErrors)
  const launchingId = useStore((s) => s.launch?.game.id ?? null)

  const inner = Math.max(0, width - EDGE * 2)
  const columns = Math.max(1, Math.round((inner + GAP) / (tileSize + GAP)))
  const tileW = Math.max(60, Math.floor((inner - GAP * (columns - 1)) / columns))
  const tileH = Math.round(tileW * 1.5)
  const rows = useMemo(() => buildRows(sections, columns), [sections, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === 'head' ? (i === 0 ? HEAD_FIRST : HEAD) : tileH + GAP),
    // Row sizes follow the tile height; keying by it means no stale cached size survives a resize.
    getItemKey: (i) => `${rows[i].key}@${tileH}`,
    overscan: 3
  })

  // Keep the reader's place (proportionally) when tile size or columns change.
  const ratio = useRef(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && ratio.current > 0) el.scrollTop = ratio.current * el.scrollHeight
  }, [tileH, columns])

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [resetKey])

  return (
    <div
      className="library-scroll"
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        ratio.current = el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0
      }}
    >
      <div className="grid-canvas" style={{ height: virtualizer.getTotalSize() + BOTTOM }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (row.kind === 'head') {
            return (
              <SectionHead
                key={item.key}
                section={row.section}
                style={{ transform: `translateY(${item.start}px)`, height: item.size, left: EDGE, right: EDGE }}
              />
            )
          }
          return (
            <div
              key={item.key}
              className="grid-row"
              role="list"
              style={{
                transform: `translateY(${item.start}px)`,
                height: tileH,
                gridTemplateColumns: `repeat(${columns}, ${tileW}px)`,
                gap: GAP,
                left: EDGE
              }}
            >
              {row.games.map((game) => (
                <div role="listitem" key={game.id} className="grid-cell" style={{ width: tileW, height: tileH }}>
                  <GameTile game={game} error={tileErrors[game.id]} launching={launchingId === game.id} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
