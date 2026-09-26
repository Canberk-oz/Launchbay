import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Platform } from '@shared/types'
import { dismissLaunch, LAUNCH_EXPAND_MS } from '../actions'
import { useStore, type LaunchState, type Rect } from '../store'
import { Cover } from './Cover'
import { Keys } from './Keys'

const LAUNCHERS: Record<Platform, string> = {
  steam: 'Steam',
  epic: 'the Epic Games Launcher',
  xbox: 'the Xbox app'
}

function statusLine(launch: LaunchState): string {
  const via = LAUNCHERS[launch.game.platform]
  switch (launch.status) {
    case 'running':
      return 'Running'
    case 'handed-off':
      return `Handed off to ${via}`
    case 'failed':
      return 'Couldn’t start'
    default:
      return `Starting through ${via}`
  }
}

/** A disc spinning up; it settles into a check once the game is running. */
function Disc({ status }: { status: LaunchState['status'] }): React.JSX.Element {
  const settled = status === 'running' || status === 'handed-off'
  return (
    <svg className={`disc${settled ? ' is-settled' : ''}`} width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="27" className="disc__rim" />
      <circle cx="32" cy="32" r="8" className="disc__hub" />
      <g className="disc__spin">
        <path d="M32 5a27 27 0 0 1 27 27" className="disc__glint" />
      </g>
      <path d="m23.5 32.5 6 6 11-12" className="disc__check" />
    </svg>
  )
}

function centeredCard(vw: number, vh: number): Rect {
  const height = Math.min(vh * 0.5, 420)
  const width = height / 1.5
  return { x: (vw - width) / 2, y: (vh - height) / 2, width, height }
}

function Scene({ launch }: { launch: LaunchState }): React.JSX.Element {
  const cover = useRef<HTMLDivElement>(null)

  // FLIP: start exactly over the clicked tile, then grow (uniform scale, so the
  // art never distorts) until it covers the window, blurring and dimming.
  useLayoutEffect(() => {
    const el = cover.current
    if (!el) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const from = launch.origin ?? centeredCard(vw, vh)
    Object.assign(el.style, {
      left: `${from.x}px`,
      top: `${from.y}px`,
      width: `${from.width}px`,
      height: `${from.height}px`
    })
    const scale = Math.max(vw / from.width, vh / from.height) * 1.12
    const dx = vw / 2 - (from.x + from.width / 2)
    const dy = vh / 2 - (from.y + from.height / 2)
    // Blur is applied before the scale, so divide to land near 26px on screen.
    const blur = 26 / scale
    const end = {
      transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      filter: `blur(${blur}px) brightness(0.5) saturate(1.15)`,
      borderRadius: '0px'
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(el.style, end)
      return
    }
    const animation = el.animate(
      [{ transform: 'translate(0px, 0px) scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', borderRadius: '6px' }, end],
      { duration: LAUNCH_EXPAND_MS, easing: 'cubic-bezier(0.25, 0.8, 0.2, 1)', fill: 'forwards' }
    )
    return () => animation.cancel()
    // Runs once per launch; the scene is keyed by the launch token.
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissLaunch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="launch"
      data-phase={launch.phase}
      data-status={launch.status}
      style={launch.game.coverAmbient ? ({ '--ambient': launch.game.coverAmbient } as React.CSSProperties) : undefined}
    >
      <div className="launch__backdrop" />
      <div className="launch__cover" ref={cover}>
        <Cover game={launch.game} />
      </div>
      <div className="launch__veil" />
      <div className="launch__status" role="status" aria-live="polite">
        <Disc status={launch.status} />
        <h2 className="launch__title">{launch.game.name}</h2>
        <p className="launch__line spec">{statusLine(launch)}</p>
        <p className="launch__hint">
          <Keys keys={['Esc']} /> back to library
        </p>
      </div>
    </div>
  )
}

export function LaunchOverlay(): React.JSX.Element | null {
  const launch = useStore((s) => s.launch)
  if (!launch) return null
  return <Scene key={launch.token} launch={launch} />
}
