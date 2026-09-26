// Electron accelerator helpers shared by the settings UI (recording a new
// shortcut) and the main process (validating before registration).

const MODIFIERS: Record<string, 'ctrl' | 'alt' | 'shift' | 'super'> = {
  commandorcontrol: 'ctrl',
  cmdorctrl: 'ctrl',
  control: 'ctrl',
  ctrl: 'ctrl',
  command: 'super',
  cmd: 'super',
  super: 'super',
  meta: 'super',
  alt: 'alt',
  option: 'alt',
  altgr: 'alt',
  shift: 'shift'
}

const NAMED_KEYS = new Set(
  [
    'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
    'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'PrintScreen',
    'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
    'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
    'numdec', 'numadd', 'numsub', 'nummult', 'numdiv'
  ].map((k) => k.toLowerCase())
)

const isFunctionKey = (key: string): boolean => /^F([1-9]|1\d|2[0-4])$/i.test(key)

function isKey(key: string): boolean {
  return /^[A-Z0-9]$/i.test(key) || isFunctionKey(key) || NAMED_KEYS.has(key.toLowerCase()) || /^[-=[\]\\;',./`]$/.test(key)
}

function splitAccelerator(acc: string): string[] {
  // "Ctrl+Plus" is the documented way to bind "+", but tolerate a trailing "++".
  const parts = acc.split('+')
  if (acc.endsWith('++')) return [...parts.slice(0, -2), 'Plus']
  return parts
}

/**
 * A usable global shortcut: exactly one non-modifier key, plus at least one of
 * Ctrl, Alt or Win. (Shift alone would swallow capital letters system-wide.)
 * Function keys may stand alone.
 */
export function isValidAccelerator(acc: string): boolean {
  if (!acc) return false
  const parts = splitAccelerator(acc).map((p) => p.trim())
  if (parts.some((p) => p === '')) return false
  const keys = parts.filter((p) => !(p.toLowerCase() in MODIFIERS))
  const mods = new Set(parts.filter((p) => p.toLowerCase() in MODIFIERS).map((p) => MODIFIERS[p.toLowerCase()]))
  if (keys.length !== 1 || !isKey(keys[0])) return false
  return isFunctionKey(keys[0]) || mods.has('ctrl') || mods.has('alt') || mods.has('super')
}

const CODE_KEYS: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Esc',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PrintScreen: 'PrintScreen',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec'
}

export interface KeyLike {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * Builds an accelerator from a keydown, by physical key (event.code) so the
 * result does not depend on the keyboard layout. Returns null while only
 * modifiers are held.
 */
export function acceleratorFromEvent(e: KeyLike): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^Numpad\d$/.test(e.code)) key = `num${e.code.slice(6)}`
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code
  else key = CODE_KEYS[e.code]
  if (!key) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(key)
  return parts.join('+')
}

const LABELS: Record<string, string> = {
  commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', control: 'Ctrl', ctrl: 'Ctrl', command: 'Win', cmd: 'Win',
  super: 'Win', meta: 'Win', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', plus: '+',
  up: '↑', down: '↓', left: '←', right: '→', return: 'Enter', escape: 'Esc', pageup: 'PgUp', pagedown: 'PgDn',
  numadd: 'Num +', numsub: 'Num −', nummult: 'Num ×', numdiv: 'Num ÷', numdec: 'Num .'
}

/** Human labels for each key in an accelerator, e.g. ["Ctrl", "Shift", "G"]. */
export function acceleratorKeys(acc: string): string[] {
  return splitAccelerator(acc)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower in LABELS) return LABELS[lower]
      if (/^num\d$/.test(lower)) return `Num ${lower.slice(3)}`
      return part.length === 1 ? part.toUpperCase() : part
    })
}
