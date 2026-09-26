import type { CSSProperties } from 'react'
import { plural } from '../lib/format'
import type { Section } from '../lib/library'
import { StarIcon } from './Icons'

/** A spec-block header: condensed caps title, a hairline rule, and the count. */
export function SectionHead({ section, style }: { section: Section; style?: CSSProperties }): React.JSX.Element {
  return (
    <div className={`section-head section-head--${section.key}`} style={style}>
      {section.key === 'favorites' && <StarIcon filled size={12} className="section-head__star" />}
      <h2 className="spec section-head__title">{section.title}</h2>
      <span className="section-head__rule" aria-hidden="true" />
      <span className="spec section-head__count">{plural(section.games.length, 'game')}</span>
    </div>
  )
}
