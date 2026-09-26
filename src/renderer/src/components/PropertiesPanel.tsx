import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cleanCollections, collectionsOf, MAX_COLLECTION_NAME, normalizeCollection, sameCollection } from '@shared/collections'
import { PLATFORM_LABELS, type Game, type GameDetails } from '@shared/types'
import { closeProperties, setCollections } from '../actions'
import { formatPlaytime, formatRelative, sizeText } from '../lib/format'
import { useStore } from '../store'
import { Cover } from './Cover'
import { CloseIcon, PlatformMark } from './Icons'
import { Sheet, SheetBlock } from './Sheet'

const api = window.launchbay

const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** "3 days ago · 23 Sep 2026, 14:02", or a muted placeholder. */
function when(epochMs: number | null, never: string): { text: string; muted: boolean } {
  return epochMs ? { text: `${formatRelative(epochMs)} · ${absolute.format(epochMs)}`, muted: false } : { text: never, muted: true }
}

/** Why a figure is missing, per store, so "—" never reads as "zero". */
function notTracked(game: Game): string {
  return game.platform === 'steam' ? 'Not recorded yet' : `Not recorded by ${PLATFORM_LABELS[game.platform]}`
}

function frameText(game: Game): string {
  if (!game.coverImageUrl) return 'None: printed box front'
  switch (game.coverFrame) {
    case 'art':
      return 'Art, cropped to fill'
    case 'band':
      return 'Wide art over a blurred copy'
    case 'mark':
      return game.coverBackground ? `Logo on ${game.coverBackground}` : 'Logo on a blurred copy'
  }
}

/** One fact. `long` values (paths, commands) stack under their label and wrap. */
function Row({ label, value, muted, long }: { label: string; value: string; muted?: boolean; long?: boolean }): React.JSX.Element {
  return (
    <div className={`spec-table__row${long ? ' spec-table__row--long' : ''}`}>
      <dt className="spec">{label}</dt>
      <dd className={`${muted ? 'is-muted' : ''}${long ? ' is-selectable' : ''}`.trim() || undefined}>{value}</dd>
    </div>
  )
}

/** The one editable part of Properties: which collections the game is in. */
function CollectionsEditor({ game, focus }: { game: Game; focus: boolean }): React.JSX.Element {
  const games = useStore((s) => s.games)
  const known = useMemo(() => collectionsOf(games).map((c) => c.name), [games])
  const suggestions = known.filter((k) => !game.tags.some((t) => sameCollection(t, k)))
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!focus) return
    // After the sheet has focused its first control.
    const t = setTimeout(() => input.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [focus, game.id])

  const add = (name: string): void => {
    const clean = normalizeCollection(name)
    if (!clean) return
    setCollections(game, cleanCollections([...game.tags, clean], known))
    setDraft('')
  }

  return (
    <div className="collections">
      {game.tags.length > 0 ? (
        <ul className="chips" aria-label="Collections">
          {game.tags.map((tag) => (
            <li key={tag} className="chip">
              <span className="chip__label">{tag}</span>
              <button
                className="chip__remove"
                aria-label={`Take out of ${tag}`}
                title={`Take out of ${tag}`}
                onClick={() => setCollections(game, game.tags.filter((t) => t !== tag))}
              >
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted collections__empty">Not in any collection yet.</p>
      )}
      <form
        className="collections__add"
        onSubmit={(e) => {
          e.preventDefault()
          add(draft)
        }}
      >
        <input
          ref={input}
          className="text-input"
          list={listId}
          value={draft}
          maxLength={MAX_COLLECTION_NAME}
          placeholder={known.length ? 'Add to a collection, or name a new one' : 'Name a new collection'}
          aria-label="Add to a collection"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button className="btn" type="submit" disabled={!normalizeCollection(draft)}>
          Add
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="collections__suggest">
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} className="chip chip--add" onClick={() => add(s)} title={`Add to ${s}`}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PropertiesBody({ game, focus }: { game: Game; focus: boolean }): React.JSX.Element {
  const [details, setDetails] = useState<GameDetails | null>(null)

  useEffect(() => {
    let live = true
    setDetails(null)
    void api.getGameDetails(game.id).then((d) => live && setDetails(d))
    return () => {
      live = false
    }
  }, [game.id, game.coverImageUrl])

  const playtime = game.playtimeMinutes ? formatPlaytime(game.playtimeMinutes) : notTracked(game)
  const lastPlayed = when(game.lastPlayed, 'Never')
  const added = when(game.addedAt, 'Not known yet')
  const update =
    game.updateAvailable === null
      ? { text: `Not reported by ${PLATFORM_LABELS[game.platform]}`, muted: true }
      : { text: game.updateAvailable ? 'Update waiting' : 'Up to date', muted: false }

  return (
    <>
      <div className="props-head">
        <div className="props-head__cover">
          <Cover game={game} />
        </div>
        <div className="props-head__text">
          <p className="props-head__name is-selectable">{game.name}</p>
          <p className="props-head__platform spec">
            <PlatformMark platform={game.platform} size={12} />
            {PLATFORM_LABELS[game.platform]}
            {game.isHidden && ' · Hidden'}
          </p>
        </div>
      </div>

      <SheetBlock title="Collections">
        <CollectionsEditor game={game} focus={focus} />
      </SheetBlock>

      <SheetBlock title="Game">
        <dl className="spec-table">
          <Row label="Size on disk" value={sizeText(game, 'long')} muted={game.sizeStatus !== 'known'} long={game.sizeStatus === 'denied' || game.sizeStatus === 'failed'} />
          <Row label="Playtime" value={playtime} muted={!game.playtimeMinutes} />
          <Row label="Last played" value={lastPlayed.text} muted={lastPlayed.muted} />
          <Row label="Added" value={added.text} muted={added.muted} />
          <Row label="Updates" value={update.text} muted={update.muted} />
          <Row label="Install folder" value={game.installPath} long />
        </dl>
      </SheetBlock>

      <SheetBlock title="Launch">
        <dl className="spec-table">
          <Row label="Launch command" value={game.launchCommand} long />
          <Row label={`${PLATFORM_LABELS[game.platform]} ID`} value={game.platformId} long />
          <Row label="Launchbay ID" value={game.id} long />
        </dl>
      </SheetBlock>

      <SheetBlock title="Cover">
        <dl className="spec-table">
          <Row label="Frame" value={frameText(game)} muted={!game.coverImageUrl} />
          <Row label="Source" value={details ? (details.coverSource ?? 'None found') : '…'} muted={!details?.coverSource} long />
        </dl>
      </SheetBlock>
    </>
  )
}

/** A game's facts, read-only, in a side sheet. Opened from the right-click menu or Alt+Enter. */
export function PropertiesPanel(): React.JSX.Element {
  const id = useStore((s) => s.propertiesId)
  const focus = useStore((s) => s.propertiesFocus === 'collections')
  const game = useStore((s) => (s.propertiesId ? s.games.find((g) => g.id === s.propertiesId) : undefined))
  // Keep showing the last game while the sheet slides out.
  const [shown, setShown] = useState<Game | undefined>(game)
  useEffect(() => {
    if (game) setShown(game)
  }, [game])
  // The game left the library (uninstalled, rescanned away) while open.
  useEffect(() => {
    if (id && !game) closeProperties()
  }, [id, game])

  return (
    <Sheet open={!!game} title="Properties" onClose={closeProperties}>
      {shown && <PropertiesBody game={shown} focus={focus} />}
    </Sheet>
  )
}
