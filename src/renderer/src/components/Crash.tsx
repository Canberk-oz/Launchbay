import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Shown instead of a blank window when the UI can't start or a render throws. */
export function CrashScreen({ title, error }: { title: string; error: unknown }): React.JSX.Element {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="crash" role="alert">
      <h1 className="crash__title">{title}</h1>
      <p className="crash__body">
        Your library, favorites and collections are safe on disk. Reloading usually clears this; if it keeps happening, the details are in
        launchbay.log.
      </p>
      {message && <p className="crash__detail is-selectable">{message}</p>}
      <button className="btn btn--primary" autoFocus onClick={() => window.location.reload()}>
        Reload Launchbay
      </button>
    </div>
  )
}

/** Catches render errors anywhere below it, so one broken component can't blank the window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Launchbay UI crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error) return <CrashScreen title="Launchbay hit a problem" error={this.state.error} />
    return this.props.children
  }
}
