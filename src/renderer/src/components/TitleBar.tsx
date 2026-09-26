import { useEffect, useMemo, useRef } from 'react'
import markUrl from '../assets/mark.png'
import { launchGame, openSettings } from '../actions'
import { buildSections } from '../lib/library'
import { useStore } from '../store'
import { CloseIcon, EnterIcon, SearchIcon, SlidersIcon } from './Icons'
import { Keys } from './Keys'

function SearchField(): React.JSX.Element {
  const search = useStore((s) => s.search)
  const games = useStore((s) => s.games)
  const platform = useStore((s) => s.platform)
  const sort = useStore((s) => s.settings.sortMode)
  const focusTick = useStore((s) => s.focusSearchTick)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusTick === 0) return
    input.current?.focus()
    input.current?.select()
  }, [focusTick])

  const total = useMemo(
    () => games.filter((g) => !g.isHidden && (platform === 'all' || g.platform === platform)).length,
    [games, platform]
  )
  const topMatch = useMemo(() => {
    if (!search.trim()) return null
    return buildSections(games, { search, platform, sort })[0]?.games[0] ?? null
  }, [games, search, platform, sort])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && topMatch) {
      e.preventDefault()
      void launchGame(topMatch, document.querySelector(`[data-game-id="${CSS.escape(topMatch.id)}"] .cover-host`))
    } else if (e.key === 'ArrowDown') {
      const first = document.querySelector<HTMLElement>('[data-game-id]')
      if (first) {
        e.preventDefault()
        first.focus()
      }
    } else if (e.key === 'Escape') {
      if (search) {
        e.preventDefault()
        useStore.setState({ search: '' })
      } else {
        input.current?.blur()
      }
    }
  }

  const noun = platform === 'all' ? 'games' : `${platform === 'steam' ? 'Steam' : platform === 'epic' ? 'Epic' : 'Xbox'} games`

  return (
    <div className="search" data-has-query={search ? '' : undefined}>
      <SearchIcon className="search__icon" size={16} />
      <input
        ref={input}
        className="search__input"
        type="text"
        value={search}
        placeholder={total > 0 ? `Search ${total} ${noun}` : 'Search games'}
        aria-label="Search games by name"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => useStore.setState({ search: e.target.value })}
        onKeyDown={onKeyDown}
      />
      {search ? (
        <>
          {topMatch && (
            <span className="search__hint" title={`Enter plays ${topMatch.name}`}>
              <EnterIcon size={13} />
              <span className="search__hint-name">{topMatch.name}</span>
            </span>
          )}
          <button
            className="search__clear"
            aria-label="Clear search"
            onClick={() => {
              useStore.setState({ search: '' })
              input.current?.focus()
            }}
          >
            <CloseIcon size={14} />
          </button>
        </>
      ) : (
        <Keys className="search__keys" keys={['Ctrl', 'F']} />
      )}
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const hotkey = useStore((s) => s.hotkey)
  const problem = hotkey.enabled && !hotkey.registered && !!hotkey.error

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <img className="titlebar__mark" src={markUrl} width={18} height={18} alt="" draggable={false} />
        <span className="titlebar__wordmark">Launchbay</span>
      </div>
      <SearchField />
      <div className="titlebar__actions">
        <button
          className="icon-btn"
          aria-label={problem ? 'Settings (the global shortcut needs attention)' : 'Settings'}
          title="Settings (Ctrl+,)"
          onClick={openSettings}
        >
          <SlidersIcon size={18} />
          {problem && <span className="icon-btn__alert" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}
