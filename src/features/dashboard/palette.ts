import type { CSSProperties } from 'react'

/**
 * Dashboard chart theming — Google-console flavored, one set per app theme.
 * Categorical slots are validated with the dataviz six-checks script
 * (light on #ffffff, dark on #2a2b2e; both pass lightness band, chroma
 * floor, adjacent CVD separation ≥ 12, contrast). Slots are assigned in
 * fixed order and NEVER cycled — beyond 8, use `other`.
 */

export type ChartTheme = {
  /** Primary timeseries (revenue line + area). */
  primary: string
  /** Secondary dashed series (profit margin). */
  margin: string
  /** Status roles — reserved, never used as "just another series". */
  good: string
  warning: string
  critical: string
  /** Single-hue bar lists. */
  products: string
  costs: string
  /** Chart chrome. */
  ink: string
  label: string
  grid: string
  baseline: string
  surface: string
  tooltip: CSSProperties
  cursorFill: string
  /** Validated 8-slot categorical palette (fixed order). */
  category: readonly string[]
  other: string
}

const LIGHT_CATEGORY = ['#1a73e8', '#d93025', '#eda100', '#1e8e3e', '#9334e6', '#129eaf', '#e8710a', '#e52592'] as const
const DARK_CATEGORY = ['#4285f4', '#ea4335', '#bd8600', '#34a853', '#a142f4', '#0e9aad', '#d5620a', '#e52592'] as const

export const CHART_THEMES: Record<'light' | 'dark', ChartTheme> = {
  light: {
    primary: '#1a73e8',
    margin: '#e37400',
    good: '#1e8e3e',
    warning: '#e37400',
    critical: '#d93025',
    products: LIGHT_CATEGORY[0],
    costs: LIGHT_CATEGORY[6],
    ink: '#80868b',
    label: '#5f6368',
    grid: '#e8eaed',
    baseline: '#dadce0',
    surface: '#ffffff',
    tooltip: {
      backgroundColor: '#ffffff',
      border: '1px solid #dadce0',
      borderRadius: 8,
      boxShadow: '0 2px 6px rgba(60,64,67,0.18)',
      fontSize: 12,
      color: '#202124',
    },
    cursorFill: 'rgba(32,33,36,0.05)',
    category: LIGHT_CATEGORY,
    other: '#80868b',
  },
  dark: {
    primary: '#8ab4f8',
    margin: '#fdd663',
    good: '#81c995',
    warning: '#fdd663',
    critical: '#f28b82',
    products: DARK_CATEGORY[0],
    costs: DARK_CATEGORY[6],
    ink: '#9aa0a6',
    label: '#bdc1c6',
    grid: '#3c4043',
    baseline: '#5f6368',
    surface: '#2a2b2e',
    tooltip: {
      backgroundColor: '#35363a',
      border: '1px solid #5f6368',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      fontSize: 12,
      color: '#e8eaed',
    },
    cursorFill: 'rgba(232,234,237,0.07)',
    category: DARK_CATEGORY,
    other: '#9aa0a6',
  },
}

/** Fixed-order categorical assignment; slots beyond 8 fold to the neutral "other" (never a generated 9th hue). */
export function categoryColor(theme: ChartTheme, index: number): string {
  return index < theme.category.length ? theme.category[index] : theme.other
}

export const UNASSIGNED = 'Unassigned'
export const UNASSIGNED_COLOR = '#cbd5e1'

/** Fixed account-manager colors, matched case-insensitively by first name (entity identity — same in both themes). */
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
