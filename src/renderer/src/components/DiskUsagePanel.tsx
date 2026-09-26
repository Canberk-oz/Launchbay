import { useMemo } from 'react'
import { PLATFORM_LABELS, type Game, type Platform } from '@shared/types'
import { closeDiskUsage, openProperties } from '../actions'
import { diskUsage, type UsageGroup } from '../lib/diskUsage'
import { formatBytes, plural, sizeText } from '../lib/format'
import { useStore } from '../store'
import { PlatformMark } from './Icons'
import { Sheet, SheetBlock } from './Sheet'

/** "3 sizes unknown · 1 measuring", or null when every size is known. */
function gaps(g: UsageGroup): string | null {
  const parts: string[] = []
  if (g.unknown) parts.push(`${g.unknown} ${g.unknown === 1 ? 'size' : 'sizes'} unknown`)
  if (g.measuring) parts.push(`${g.measuring} measuring`)
  return parts.length ? parts.join(' · ') : null
}

function GroupRow({ g, max, mark }: { g: UsageGroup; max: number; mark?: Platform }): React.JSX.Element {
  const gap = gaps(g)
  return (
    <div className="usage-row">
      <div className="usage-row__line">
        <span className="usage-row__label spec">
          {mark && <PlatformMark platform={mark} size={13} />}
          {g.label}
        </span>
        <span className="usage-row__value">
          {formatBytes(g.bytes || null)} <span className="muted">· {plural(g.games, 'game')}</span>
        </span>
      </div>
      <span className="usage-bar" aria-hidden="true">
        <span style={{ width: `${max > 0 ? (g.bytes / max) * 100 : 0}%` }} />
      </span>
      {gap && <span className="usage-row__gap">{gap}</span>}
    </div>
  )
}

function GameRow({ game, max }: { game: Game; max: number }): React.JSX.Element {
  return (
    <button className="usage-row usage-row--game" onClick={() => openProperties(game.id)} title="Properties">
      <span className="usage-row__line">
        <span className="usage-row__name">
          <PlatformMark platform={game.platform} size={12} />
          {game.name}
        </span>
        <span className="usage-row__value">{formatBytes(game.sizeOnDisk)}</span>
      </span>
      <span className="usage-bar" aria-hidden="true">
        <span style={{ width: `${max > 0 ? ((game.sizeOnDisk ?? 0) / max) * 100 : 0}%` }} />
      </span>
    </button>
  )
}

function DiskUsageBody(): React.JSX.Element {
  const games = useStore((s) => s.games)
  const usage = useMemo(() => diskUsage(games), [games])
  const { total } = usage
  const gap = gaps(total)
  const platformMax = Math.max(0, ...usage.byPlatform.map((g) => g.bytes))
  const driveMax = Math.max(0, ...usage.byDrive.map((g) => g.bytes))
  const largestMax = usage.largest[0]?.sizeOnDisk ?? 0

  return (
    <>
      <div className="usage-total">
        <p className="usage-total__bytes">{formatBytes(total.bytes || null)}</p>
        <p className="usage-total__line">
          {total.known === total.games
            ? `across all ${plural(total.games, 'game')}, hidden ones included`
            : `across ${total.known} of ${plural(total.games, 'game')} (hidden ones included)`}
        </p>
        {gap && (
          <p className="usage-total__gap">
            {gap}. The total leaves {total.unknown + total.measuring === 1 ? 'that game' : 'those games'} out.
          </p>
        )}
      </div>

      <SheetBlock title="By store">
        {usage.byPlatform.map((g) => (
          <GroupRow key={g.key} g={g} max={platformMax} mark={g.key as Platform} />
        ))}
      </SheetBlock>

      <SheetBlock title="By drive">
        {usage.byDrive.map((g) => (
          <GroupRow key={g.key} g={g} max={driveMax} />
        ))}
      </SheetBlock>

      {usage.largest.length > 0 && (
        <SheetBlock title="Largest games">
          {usage.largest.map((game) => (
            <GameRow key={game.id} game={game} max={largestMax} />
          ))}
        </SheetBlock>
      )}

      {usage.unknown.length > 0 && (
        <SheetBlock title={`Size unknown · ${usage.unknown.length}`}>
          <dl className="spec-table">
            {usage.unknown.map((game) => (
              <div className="spec-table__row spec-table__row--long" key={game.id}>
                <dt className="usage-row__name">
                  <PlatformMark platform={game.platform} size={12} />
                  {game.name}
                </dt>
                <dd className="is-muted">
                  {game.sizeStatus === 'unreported'
                    ? `${PLATFORM_LABELS[game.platform]} doesn’t report a size for this game`
                    : sizeText(game, 'long')}
                </dd>
              </div>
            ))}
          </dl>
        </SheetBlock>
      )}
    </>
  )
}

/** Where the disk space goes: by store, by drive, the largest games, and every size that's unknown. */
export function DiskUsagePanel(): React.JSX.Element {
  const open = useStore((s) => s.diskUsageOpen)
  return (
    <Sheet open={open} title="Disk usage" onClose={closeDiskUsage}>
      {open && <DiskUsageBody />}
    </Sheet>
  )
}
