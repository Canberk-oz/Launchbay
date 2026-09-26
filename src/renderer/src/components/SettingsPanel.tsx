import { useEffect, useMemo, useRef, useState } from 'react'
import { PLATFORM_LABELS, PLATFORMS, type MediaCacheInfo, type Settings } from '@shared/types'
import { closeSettings, refreshLibrary, unhideGame, updateSettings } from '../actions'
import { formatBytes, formatRelative, plural } from '../lib/format'
import { useStore } from '../store'
import { HotkeyRecorder } from './HotkeyRecorder'
import { CloseIcon, PlatformMark, RefreshIcon } from './Icons'

const api = window.launchbay

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange(value: boolean): void
}): React.JSX.Element {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {description && <span className="toggle__desc">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </label>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="spec-block">
      <div className="spec-block__head">
        <h3 className="spec">{title}</h3>
        <span className="spec-block__rule" aria-hidden="true" />
      </div>
      {children}
    </section>
  )
}

function SettingsBody(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const games = useStore((s) => s.games)
  const scan = useStore((s) => s.scan)
  const isPackaged = useStore((s) => s.isPackaged)
  const version = useStore((s) => s.appVersion)
  const [cache, setCache] = useState<MediaCacheInfo | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    void api.getMediaCacheInfo().then(setCache)
  }, [games])

  const counts = useMemo(() => {
    const c = { steam: 0, epic: 0, xbox: 0 }
    for (const g of games) c[g.platform]++
    return c
  }, [games])
  const hidden = useMemo(() => games.filter((g) => g.isHidden).sort((a, b) => a.name.localeCompare(b.name)), [games])
  const set = (patch: Partial<Settings>): void => updateSettings(patch, true)

  return (
    <>
      <Block title="Global shortcut">
        <HotkeyRecorder />
        <Toggle
          label="Summon Launchbay with the shortcut"
          checked={settings.hotkeyEnabled}
          onChange={(v) => set({ hotkeyEnabled: v })}
        />
      </Block>

      <Block title="Behavior">
        <Toggle
          label="Keep running in the tray when closed"
          description="The shortcut keeps working and the library stays loaded, so it opens instantly."
          checked={settings.closeToTray}
          onChange={(v) => set({ closeToTray: v })}
        />
        <Toggle
          label="Hide Launchbay once a game is running"
          checked={settings.hideAfterLaunch}
          onChange={(v) => set({ hideAfterLaunch: v })}
        />
        <Toggle
          label="Start with Windows, in the tray"
          description={isPackaged ? undefined : 'Available in the installed app.'}
          checked={settings.launchAtLogin}
          disabled={!isPackaged}
          onChange={(v) => set({ launchAtLogin: v })}
        />
      </Block>

      <Block title="Libraries">
        <dl className="spec-table">
          {PLATFORMS.map((p) => (
            <div className="spec-table__row" key={p}>
              <dt className="spec">
                <PlatformMark platform={p} size={13} />
                {PLATFORM_LABELS[p]}
              </dt>
              <dd className={counts[p] ? undefined : 'is-muted'}>{counts[p] ? plural(counts[p], 'game') : 'Not found'}</dd>
            </div>
          ))}
        </dl>
        <div className="spec-block__foot">
          <span className="muted">Last scanned {formatRelative(scan.lastScanAt).toLowerCase()}</span>
          <button className="btn" onClick={() => void refreshLibrary()} disabled={scan.scanning}>
            <RefreshIcon size={15} className={scan.scanning ? 'is-spinning' : undefined} />
            {scan.scanning ? 'Scanning…' : 'Refresh library'}
          </button>
        </div>
        {hidden.length > 0 && (
          <div className="hidden-list">
            <h4 className="spec hidden-list__title">Hidden · {hidden.length}</h4>
            <ul>
              {hidden.map((g) => (
                <li key={g.id}>
                  <PlatformMark platform={g.platform} size={12} />
                  <span className="hidden-list__name">{g.name}</span>
                  <button className="link-btn" onClick={() => unhideGame(g.id)}>
                    Show
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block title="Media cache">
        <dl className="spec-table">
          <div className="spec-table__row">
            <dt className="spec">Covers</dt>
            <dd>{cache ? formatBytes(cache.coverBytes) : '…'}</dd>
          </div>
          <div className="spec-table__row">
            <dt className="spec">Trailer previews</dt>
            <dd>{cache ? formatBytes(cache.trailerBytes) : '…'}</dd>
          </div>
        </dl>
        <div className="spec-block__foot">
          <span className="muted">Previews download the first time you hover a Steam game.</span>
          <button
            className="btn"
            disabled={clearing || !cache?.trailerBytes}
            onClick={async () => {
              setClearing(true)
              await api.clearTrailerCache()
              setCache(await api.getMediaCacheInfo())
              setClearing(false)
            }}
          >
            Clear previews
          </button>
        </div>
      </Block>

      <p className="sheet__version spec">Launchbay {version}</p>
    </>
  )
}

/** A side sheet, so the library stays visible behind it. */
export function SettingsPanel(): React.JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const [mounted, setMounted] = useState(open)
  const panel = useRef<HTMLElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 220)
    returnFocus.current?.focus?.()
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (open && mounted) panel.current?.querySelector<HTMLElement>('button, [href], input')?.focus()
  }, [open, mounted])

  if (!mounted) return null

  return (
    <div className={`sheet-layer${open ? ' is-open' : ''}`}>
      <div className="sheet-scrim" onClick={closeSettings} />
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeSettings()
          }
        }}
      >
        <header className="sheet__head">
          <h2 id="settings-title" className="sheet__title">
            Settings
          </h2>
          <button className="icon-btn" aria-label="Close settings" onClick={closeSettings}>
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="sheet__body">
          <SettingsBody />
        </div>
      </aside>
    </div>
  )
}
