import { dismissToast } from '../actions'
import { useStore } from '../store'
import { CheckIcon, CloseIcon, WarningIcon } from './Icons'

/** Boxed notices, like the "important" slip in a game box. */
export function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span className="toast__icon" aria-hidden="true">
            {t.tone === 'info' ? <CheckIcon size={15} /> : <WarningIcon size={15} />}
          </span>
          <div className="toast__text">
            <p className="toast__title">{t.title}</p>
            {t.message && <p className="toast__message">{t.message}</p>}
          </div>
          {t.action && (
            <button
              className="btn btn--small"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn icon-btn--small" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
