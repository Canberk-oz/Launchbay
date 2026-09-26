import { useEffect, useRef, useState } from 'react'
import { TILE_SIZE_MAX, TILE_SIZE_MIN } from '@shared/types'
import {
  closeSettings,
  focusSearch,
  launchGame,
  openSettings,
  pendingSettings,
  pushToast,
  refreshLibrary,
  hotkeyLabel,
  updateSettings
} from './actions'
import { useStore } from './store'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { LibraryView } from './components/LibraryView'
import { LaunchOverlay } from './components/LaunchOverlay'
import { SettingsPanel } from './components/SettingsPanel'
import { Toasts } from './components/Toasts'

const api = window.launchbay

function useMainProcessEvents(setAnim: (a: 'in' | 'out' | null) => void): void {
  useEffect(() => {
    const offs = [
      api.onLibraryUpdated((games) => useStore.setState({ games })),
      api.onScanStatus((scan) => useStore.setState({ scan })),
      api.onSettingsChanged((settings) => useStore.setState({ settings: { ...settings, ...pendingSettings() } })),
      api.onHotkeyStatus((hotkey) => useStore.setState({ hotkey })),
      api.onOpenSettings(() => openSettings()),
      api.onContextAction(({ action, id }) => {
        if (action !== 'launch') return
        const game = useStore.getState().games.find((g) => g.id === id)
        if (game) void launchGame(game, document.querySelector(`[data-game-id="${CSS.escape(id)}"] .cover-host`))
      }),
      api.onWindowVisibility((visibility) => {
        if (visibility === 'hide') {
          useStore.setState({ windowHidden: true, overlay: false })
          setAnim('out')
          return
        }
        useStore.setState({ windowHidden: false, overlay: visibility === 'overlay' })
        setAnim('in')
        if (visibility === 'overlay') focusSearch()
      })
    ]
    return () => offs.forEach((off) => off())
  }, [setAnim])
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const state = useStore.getState()
      if (state.launch) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        focusSearch()
      } else if (ctrl && e.key === ',') {
        e.preventDefault()
        if (state.settingsOpen) closeSettings()
        else openSettings()
      } else if (e.key === 'F5' || (ctrl && e.key.toLowerCase() === 'r')) {
        e.preventDefault()
        void refreshLibrary()
      } else if (ctrl && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault()
        if (state.settings.viewMode !== 'grid') return
        const step = e.key === '-' ? -24 : 24
        updateSettings({ tileSize: Math.min(TILE_SIZE_MAX, Math.max(TILE_SIZE_MIN, state.settings.tileSize + step)) })
      } else if (e.key === 'Escape' && !e.defaultPrevented && !state.settingsOpen) {
        if (state.search) useStore.setState({ search: '' })
        else if (state.overlay) void api.hideWindow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Tells the user once, at startup, when the saved shortcut could not be registered. */
function useHotkeyStartupWarning(): void {
  const warned = useRef(false)
  const hotkey = useStore((s) => s.hotkey)
  useEffect(() => {
    if (warned.current || !hotkey.enabled || hotkey.registered || !hotkey.error) return
    warned.current = true
    pushToast(
      {
        tone: 'warning',
        title: `${hotkeyLabel(hotkey.accelerator)} is unavailable`,
        message:
          hotkey.error === 'in-use'
            ? 'Another app already uses this shortcut, so the overlay can’t be summoned with it.'
            : 'This combination can’t be used as a global shortcut.',
        action: { label: 'Choose another', run: openSettings }
      },
      12_000
    )
  }, [hotkey])
}

export function App(): React.JSX.Element {
  const [anim, setAnim] = useState<'in' | 'out' | null>(null)
  useMainProcessEvents(setAnim)
  useGlobalKeys()
  useHotkeyStartupWarning()

  return (
    <div
      className={`app${anim ? ` app--${anim}` : ''}`}
      // The exit state holds until the next show so nothing flashes while the window fades out.
      onAnimationEnd={(e) => e.target === e.currentTarget && anim === 'in' && setAnim(null)}
    >
      <TitleBar />
      <Toolbar />
      <LibraryView />
      <LaunchOverlay />
      <SettingsPanel />
      <Toasts />
    </div>
  )
}
