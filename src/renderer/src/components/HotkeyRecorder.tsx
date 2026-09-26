import { useEffect, useState } from 'react'
import { acceleratorFromEvent, acceleratorKeys, isValidAccelerator } from '@shared/accelerator'
import { DEFAULT_HOTKEY, type HotkeyChangeResult } from '@shared/types'
import { hotkeyLabel } from '../actions'
import { useStore } from '../store'
import { CheckIcon, WarningIcon } from './Icons'
import { Keys } from './Keys'

const api = window.launchbay

function heldModifiers(e: KeyboardEvent): string[] {
  const keys: string[] = []
  if (e.ctrlKey) keys.push('Ctrl')
  if (e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')
  if (e.metaKey) keys.push('Win')
  return keys
}

function failureText(result: HotkeyChangeResult): string {
  const label = hotkeyLabel(result.accelerator)
  return result.error === 'in-use'
    ? `${label} is already taken by another app. Try a different combination.`
    : `${label} can’t be used as a global shortcut.`
}

/**
 * Shows the overlay shortcut as keycaps and records a new one. The current
 * shortcut is released while recording so pressing it doesn't toggle the
 * window, and a rejected combination leaves the old one in place.
 */
export function HotkeyRecorder(): React.JSX.Element {
  const status = useStore((s) => s.hotkey)
  const enabled = useStore((s) => s.settings.hotkeyEnabled)
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error' | 'hint'; text: string } | null>(null)

  useEffect(() => {
    if (!recording) return
    void api.suspendHotkey(true)
    setHeld([])
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.type === 'keyup') {
        setHeld(heldModifiers(e))
        return
      }
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setRecording(false)
        setFeedback(null)
        return
      }
      setHeld(heldModifiers(e))
      const accelerator = acceleratorFromEvent(e)
      if (!accelerator) return // only modifiers so far
      if (!isValidAccelerator(accelerator)) {
        setFeedback({ tone: 'hint', text: 'Hold Ctrl, Alt or Win with the key. Shift alone would block normal typing.' })
        return
      }
      setRecording(false)
      void api.setHotkey(accelerator).then((result) => {
        setFeedback(
          result.ok
            ? { tone: 'ok', text: `Saved. Press ${hotkeyLabel(result.accelerator)} anywhere to summon Launchbay.` }
            : { tone: 'error', text: failureText(result) }
        )
      })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      void api.suspendHotkey(false)
    }
  }, [recording])

  const problem = enabled && !status.registered && status.error !== null && !recording

  let line: React.ReactNode
  if (feedback && !recording) {
    line = (
      <p className={`hotkey__line is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
        {feedback.tone === 'ok' ? <CheckIcon size={14} /> : feedback.tone === 'error' ? <WarningIcon size={14} /> : null}
        {feedback.text}
      </p>
    )
  } else if (recording) {
    line = <p className={`hotkey__line${feedback?.tone === 'hint' ? ' is-hint' : ''}`}>{feedback?.text ?? 'Press the new combination. Esc cancels.'}</p>
  } else if (problem) {
    line = (
      <p className="hotkey__line is-error" role="alert">
        <WarningIcon size={14} />
        {status.error === 'in-use'
          ? 'Another app already uses this shortcut, so it can’t summon Launchbay. Choose a different one.'
          : 'This combination can’t be used as a global shortcut. Choose a different one.'}
      </p>
    )
  } else if (!enabled) {
    line = <p className="hotkey__line">The shortcut is off. Launchbay opens from the tray icon.</p>
  } else {
    line = <p className="hotkey__line">Works anywhere, even while a game has focus or Launchbay is in the tray.</p>
  }

  return (
    <div className={`hotkey${problem ? ' is-problem' : ''}${!enabled ? ' is-off' : ''}`}>
      <div className="hotkey__row">
        <div className={`hotkey__keys${recording ? ' is-recording' : ''}`} aria-live="polite">
          {recording ? (
            held.length ? (
              <Keys keys={[...held, '…']} large />
            ) : (
              <span className="hotkey__prompt">Press a shortcut</span>
            )
          ) : (
            <Keys keys={acceleratorKeys(status.accelerator || DEFAULT_HOTKEY)} large />
          )}
        </div>
        {recording ? (
          <button className="btn" onClick={() => setRecording(false)}>
            Cancel
          </button>
        ) : (
          <button
            className="btn btn--primary"
            onClick={() => {
              setFeedback(null)
              setRecording(true)
            }}
          >
            Change
          </button>
        )}
      </div>
      {line}
      {!recording && status.accelerator !== DEFAULT_HOTKEY && (
        <button
          className="link-btn"
          onClick={() =>
            void api.setHotkey(DEFAULT_HOTKEY).then((result) =>
              setFeedback(result.ok ? { tone: 'ok', text: 'Back to Ctrl + Shift + G.' } : { tone: 'error', text: failureText(result) })
            )
          }
        >
          Reset to Ctrl + Shift + G
        </button>
      )}
    </div>
  )
}
