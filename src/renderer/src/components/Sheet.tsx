import { useEffect, useId, useRef, useState } from 'react'
import { CloseIcon } from './Icons'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * A side sheet, so the library stays visible behind it (settings, game
 * properties). It stays mounted through its closing transition, takes focus
 * when it opens and keeps it (Tab cycles inside the sheet), returns focus
 * when it closes, and closes on Esc or a click on the scrim.
 */
export function Sheet({
  open,
  title,
  onClose,
  children
}: {
  open: boolean
  title: string
  onClose(): void
  children: React.ReactNode
}): React.JSX.Element | null {
  const [mounted, setMounted] = useState(open)
  const panel = useRef<HTMLElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

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

  // The sheet is modal: Tab stays inside it, and Esc closes it wherever focus is.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open || !mounted) return
    const onKey = (e: KeyboardEvent): void => {
      const el = panel.current
      if (!el) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute('disabled') && n.getClientRects().length > 0)
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!first) e.preventDefault()
      else if (!el.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, mounted])

  if (!mounted) return null

  return (
    <div className={`sheet-layer${open ? ' is-open' : ''}`}>
      <div className="sheet-scrim" onClick={onClose} />
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <header className="sheet__head">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          <button className="icon-btn" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </aside>
    </div>
  )
}

/** A titled section in a sheet: condensed caps and a hairline rule. */
export function SheetBlock({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
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
