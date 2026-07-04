/**
 * Legacy dashboard palette (parity with the Chart.js colors in index.php).
 * Deliberately separate from lib/chart-palette.ts — the executive dashboard
 * reproduces the legacy look; the rest of the app keeps the app palette.
 */

export const INDIGO = '#6366f1'
export const GREEN = '#10b981'
export const YELLOW = '#f59e0b'
export const RED = '#ef4444'
export const SKY = '#0ea5e9'

/** By Category doughnut: 8 colors, rotating (legacy cycles rather than folding). */
export const CATEGORY_PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
] as const

export const UNASSIGNED = 'Unassigned'
export const UNASSIGNED_COLOR = '#cbd5e1'

/** Fixed account-manager colors, matched case-insensitively by first name. */
const MANAGER_COLORS: Array<{ match: string; color: string; darkText?: boolean }> = [
  { match: 'anne', color: '#419CA1' },
  { match: 'cherry', color: '#AFD5F7', darkText: true },
  { match: 'glenda', color: '#007725' },
  { match: 'ivy', color: '#AA338A' },
  { match: 'ally', color: '#0000FF' },
  { match: 'hannah', color: '#FC0FC0' },
]

export function managerColor(name: string | null | undefined): string {
  if (!name || name === UNASSIGNED) return UNASSIGNED_COLOR
  const lower = name.toLowerCase()
  return MANAGER_COLORS.find((m) => lower.includes(m.match))?.color ?? UNASSIGNED_COLOR
}

/** Legend pills: light fills (Cherry, Unassigned) need dark text. */
export function managerPillText(name: string | null | undefined): string {
  if (!name || name === UNASSIGNED) return '#334155'
  const lower = name.toLowerCase()
  const hit = MANAGER_COLORS.find((m) => lower.includes(m.match))
  if (!hit) return '#334155'
  return hit.darkText ? '#1e293b' : '#ffffff'
}
