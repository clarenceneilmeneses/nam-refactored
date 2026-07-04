/**
 * Quote reference generator, legacy format "YYYY-NNN" (e.g. 2026-047):
 * next NNN = highest NNN among this year's refs + 1, zero-padded to 3.
 */
export function nextQuoteRef(existingRefs: Array<string | null | undefined>, now: Date = new Date()): string {
  const year = String(now.getFullYear())
  let max = 0
  for (const ref of existingRefs) {
    const match = ref?.match(/^(\d{4})-(\d+)$/)
    if (match && match[1] === year) max = Math.max(max, parseInt(match[2], 10))
  }
  return `${year}-${String(max + 1).padStart(3, '0')}`
}
