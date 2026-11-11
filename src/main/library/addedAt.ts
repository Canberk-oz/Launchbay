// When a game arrived on this PC. Pure, so it is unit-tested under plain Node.

/** Creation times before this are filesystem junk (zeroed or unset), not an install date. */
const EARLIEST_PLAUSIBLE = Date.UTC(2003, 0, 1) // Steam's launch

/**
 * The install folder's creation time when it is a believable install date,
 * otherwise `now` (the moment Launchbay first saw the game).
 */
export function addedAtFrom(folderCreatedMs: number | null | undefined, now: number): number {
  if (typeof folderCreatedMs !== 'number' || !Number.isFinite(folderCreatedMs)) return now
  if (folderCreatedMs < EARLIEST_PLAUSIBLE || folderCreatedMs > now) return now
  return Math.round(folderCreatedMs)
}
