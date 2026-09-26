import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game } from '@shared/types'
import { useStore } from '../store'

/** Continuous hover needed before a trailer starts; shorter passes never fetch anything. */
export const PREVIEW_DELAY_MS = 800
const FADE_OUT_MS = 320

/**
 * idle → armed (hovering, timer running) → loading (fetching or building the
 * preview) → previewing (video mounted; `playing` once frames arrive).
 */
export type PreviewPhase = 'idle' | 'armed' | 'loading' | 'previewing'

export interface TrailerPreview {
  phase: PreviewPhase
  src: string | null
  playing: boolean
  onPointerEnter(): void
  onPointerLeave(): void
  stop(): void
  videoProps: {
    onPlaying(): void
    onError(): void
  }
}

export function useTrailerPreview(game: Game): TrailerPreview {
  const canPreview = game.trailerState !== 'none'
  const [phase, setPhase] = useState<PreviewPhase>('idle')
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const hovering = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const windowHidden = useStore((s) => s.windowHidden)
  const launchActive = useStore((s) => s.launch !== null)

  const stop = useCallback(() => {
    hovering.current = false
    window.clearTimeout(timer.current)
    setPhase('idle')
    setPlaying(false)
  }, [])

  // Crossfade back to the cover, then drop the video element.
  useEffect(() => {
    if (phase !== 'idle' || !src) return
    const t = window.setTimeout(() => setSrc(null), FADE_OUT_MS)
    return () => window.clearTimeout(t)
  }, [phase, src])

  useEffect(() => {
    if (windowHidden || launchActive) stop()
  }, [windowHidden, launchActive, stop])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onPointerEnter = useCallback(() => {
    hovering.current = true
    if (!canPreview) return
    window.clearTimeout(timer.current)
    setPhase('armed')
    timer.current = window.setTimeout(async () => {
      if (!hovering.current) return
      setPhase('loading')
      const result = await window.launchbay.getTrailer(game.id).catch(() => null)
      if (!hovering.current) return
      if (!result) {
        setPhase('idle')
        return
      }
      setSrc(result.src)
      setPhase('previewing')
    }, PREVIEW_DELAY_MS)
  }, [canPreview, game.id])

  return {
    phase,
    src,
    playing,
    onPointerEnter,
    onPointerLeave: stop,
    stop,
    videoProps: {
      onPlaying: () => {
        if (hovering.current) setPlaying(true)
      },
      onError: () => {
        setPlaying(false)
        setSrc(null)
        setPhase('idle')
      }
    }
  }
}
