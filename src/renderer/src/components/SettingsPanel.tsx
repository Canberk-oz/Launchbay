import { useEffect, useMemo, useState } from 'react'
import { PLATFORM_LABELS, PLATFORMS, type MediaCacheInfo, type Settings } from '@shared/types'
import { closeSettings, exportLibrary, refreshLibrary, unhideGame, updateSettings } from '../actions'
import { formatBytes, formatRelative, plural } from '../lib/format'
import { useStore } from '../store'
import { HotkeyRecorder } from './HotkeyRecorder'
import { PlatformMark, RefreshIcon } from './Icons'
import { Sheet, SheetBlock as Block } from './Sheet'

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
        <div className="spec-block__foot">
          <span className="muted">Export every game, hidden ones included.</span>
          <span className="spec-block__actions">
            <button className="btn" onClick={() => void exportLibrary('csv')}>
              Export CSV
            </button>
            <button className="btn" onClick={() => void exportLibrary('json')}>
              Export JSON
            </button>
          </span>
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

/** Settings, in a side sheet so the library stays visible behind it. */
export function SettingsPanel(): React.JSX.Element {
  const open = useStore((s) => s.settingsOpen)
  return (
    <Sheet open={open} title="Settings" onClose={closeSettings}>
      <SettingsBody />
    </Sheet>
  )
}
