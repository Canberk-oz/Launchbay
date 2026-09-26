import { useEffect, useId, useRef, useState } from 'react'
import { CloseIcon } from './Icons'

/**
 * A side sheet, so the library stays visible behind it (settings, game
 * properties). It stays mounted through its closing transition, takes focus
 * when it opens, returns focus when it closes, and closes on Esc or a click
 * on the scrim.
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
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
