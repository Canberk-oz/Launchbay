import type { SVGProps } from 'react'
import type { Platform } from '@shared/types'

// One stroke family: 24px grid, 1.75 stroke, round caps and joins.
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Stroke({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 4.5 4.5" />
  </Stroke>
)

/** An arrow settling into a tray: an update waiting to install. */
export const UpdateIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Stroke>
)

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Stroke>
)

/** Two rows of portrait boxes: the cover wall. */
export const GridIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <rect x="4" y="3.5" width="4.5" height="7" rx="1" />
    <rect x="9.75" y="3.5" width="4.5" height="7" rx="1" />
    <rect x="15.5" y="3.5" width="4.5" height="7" rx="1" />
    <rect x="4" y="13.5" width="4.5" height="7" rx="1" />
    <rect x="9.75" y="13.5" width="4.5" height="7" rx="1" />
    <rect x="15.5" y="13.5" width="4.5" height="7" rx="1" />
  </Stroke>
)

/** Rows with a small box on the left: the spec table. */
export const ListIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <rect x="4" y="4" width="3.5" height="5" rx="0.8" />
    <rect x="4" y="15" width="3.5" height="5" rx="0.8" />
    <path d="M11 6.5h9M11 17.5h9" />
  </Stroke>
)

export const RefreshIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Stroke>
)

export const SlidersIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Stroke>
)

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }): React.JSX.Element => (
  <Stroke {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.6 2.55 5.3 5.8.78-4.23 4.02 1.05 5.75L12 16.7l-5.17 2.75 1.05-5.75L3.65 9.68l5.8-.78Z" />
  </Stroke>
)

export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="m7 10 5 5 5-5" />
  </Stroke>
)

export const TileSmallIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <rect x="9" y="8" width="6" height="9" rx="1" />
  </Stroke>
)

export const TileLargeIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <rect x="6" y="3.5" width="12" height="17" rx="1.5" />
  </Stroke>
)

export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Stroke>
)

export const WarningIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M12 4 21 19.5H3Z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Stroke>
)

export const EyeIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Stroke>
)

export const EnterIcon = (p: IconProps): React.JSX.Element => (
  <Stroke {...p}>
    <path d="M19 5v6.5a2 2 0 0 1-2 2H6" />
    <path d="m9.5 9.5-4 4 4 4" />
  </Stroke>
)

// ---------------------------------------------------------------- platform marks

const STEAM_PATH =
  'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z'

// The Epic shield silhouette with its wordmark reduced to three bars, so it
// stays legible at badge size.
const EPIC_SHIELD = 'M4.2 1.5h15.6c.9 0 1.4.5 1.4 1.4v14.9c0 .8-.3 1.3-1 1.6l-8.2 3.4-8.2-3.4c-.7-.3-1-.8-1-1.6V2.9c0-.9.5-1.4 1.4-1.4Z'

export function PlatformMark({ platform, size = 14 }: { platform: Platform; size?: number }): React.JSX.Element {
  if (platform === 'steam') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d={STEAM_PATH} />
      </svg>
    )
  }
  if (platform === 'epic') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={EPIC_SHIELD} fill="currentColor" />
        <path d="M7.5 6h3.2M7.5 9.3h2.6M7.5 12.6h3.2M7.5 6v6.6M13.4 6v6.6M16.3 6v6.6" stroke="var(--mark-cut, #0d0d0f)" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M9 17.3h6" stroke="var(--mark-cut, #0d0d0f)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.2" />
      <path d="M6.6 6.2C9.3 8.3 11 10.4 12 12c1-1.6 2.7-3.7 5.4-5.8M6.6 17.8C9.3 15.7 11 13.6 12 12c1 1.6 2.7 3.7 5.4 5.8" />
    </svg>
  )
}
