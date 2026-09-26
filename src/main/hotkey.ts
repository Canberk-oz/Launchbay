import { globalShortcut } from 'electron'
import { EventEmitter } from 'node:events'
import { isValidAccelerator } from '@shared/accelerator'
import type { HotkeyChangeResult, HotkeyError, HotkeyStatus } from '@shared/types'
import { createLogger } from './util/log'

const log = createLogger('hotkey')

/**
 * Owns the single global overlay shortcut. Registration failure (another app
 * already owns the combination, or an unusable accelerator) becomes a status
 * the settings panel can show, never an exception.
 */
export class HotkeyManager extends EventEmitter {
  private readonly onTrigger: () => void
  private registered: string | null = null
  private suspended = false
  private status: HotkeyStatus

  constructor(onTrigger: () => void) {
    super()
    this.onTrigger = onTrigger
    this.status = { accelerator: '', enabled: false, registered: false, error: null }
  }

  getStatus(): HotkeyStatus {
    return this.status
  }

  private tryRegister(accelerator: string): HotkeyError | null {
    if (!isValidAccelerator(accelerator)) return 'invalid'
    try {
      return globalShortcut.register(accelerator, this.onTrigger) ? null : 'in-use'
    } catch (err) {
      log.warn(`could not register ${accelerator}`, err)
      return 'invalid'
    }
  }

  private unregisterCurrent(): void {
    if (this.registered) {
      try {
        globalShortcut.unregister(this.registered)
      } catch {
        // already gone
      }
      this.registered = null
    }
  }

  private setStatus(status: HotkeyStatus): HotkeyStatus {
    this.status = status
    this.emit('status', status)
    return status
  }

  /** Applies the saved setting (at startup, or when the enable toggle changes). */
  apply(accelerator: string, enabled: boolean): HotkeyStatus {
    this.unregisterCurrent()
    if (!enabled) return this.setStatus({ accelerator, enabled, registered: false, error: null })
    if (this.suspended) return this.setStatus({ accelerator, enabled, registered: false, error: null })
    const error = this.tryRegister(accelerator)
    if (!error) this.registered = accelerator
    else log.warn(`global shortcut ${accelerator} unavailable: ${error}`)
    return this.setStatus({ accelerator, enabled, registered: !error, error })
  }

  /**
   * Tries a new accelerator. On failure the previous registration is restored
   * and the result says why, so the user can pick something else.
   */
  change(accelerator: string): HotkeyChangeResult {
    const previous = this.status
    this.unregisterCurrent()
    const error = this.tryRegister(accelerator)
    if (!error) {
      this.registered = accelerator
      this.suspended = false
      const status = this.setStatus({ accelerator, enabled: true, registered: true, error: null })
      return { ok: true, accelerator, error: null, status }
    }
    if (previous.enabled && previous.accelerator) this.apply(previous.accelerator, true)
    return { ok: false, accelerator, error, status: this.status }
  }

  /** Temporarily releases the shortcut while the user records a new one. */
  suspend(suspended: boolean): void {
    if (suspended === this.suspended) return
    this.suspended = suspended
    if (suspended) this.unregisterCurrent()
    else if (this.status.enabled) this.apply(this.status.accelerator, true)
  }

  dispose(): void {
    this.unregisterCurrent()
  }
}
