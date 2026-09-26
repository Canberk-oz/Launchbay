/** A row of drawn keycaps, e.g. Ctrl + Shift + G. */
export function Keys({ keys, large, className }: { keys: string[]; large?: boolean; className?: string }): React.JSX.Element {
  return (
    <span className={`kbd-group${className ? ` ${className}` : ''}`} aria-label={keys.join(' + ')}>
      {keys.map((key, i) => (
        <kbd key={`${key}-${i}`} className={large ? 'kbd kbd--lg' : 'kbd'} aria-hidden="true">
          {key}
        </kbd>
      ))}
    </span>
  )
}
