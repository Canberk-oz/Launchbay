export type Direction = 'up' | 'down' | 'left' | 'right'

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

export function arrowDirection(key: string): Direction | null {
  return KEY_DIRECTIONS[key] ?? null
}

/**
 * Moves focus to the nearest rendered game in a direction, by geometry, so the
 * same code walks the grid, the list, and across the favorites/library split.
 * Returns false at an edge (so ArrowUp from the first row can return to search).
 */
export function moveFocus(from: HTMLElement, dir: Direction): boolean {
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const el of document.querySelectorAll<HTMLElement>('[data-game-id]')) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const dx = b.left + b.width / 2 - ax
    const dy = b.top + b.height / 2 - ay
    let score: number
    if (dir === 'left' || dir === 'right') {
      if (Math.abs(dy) > a.height / 2) continue // stay in the row
      if (dir === 'right' ? dx <= 2 : dx >= -2) continue
      score = Math.abs(dx)
    } else {
      if (dir === 'down' ? dy <= 2 : dy >= -2) continue
      score = Math.abs(dy) * 4 + Math.abs(dx)
    }
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (!best) return false
  best.focus({ preventScroll: true })
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return true
}
