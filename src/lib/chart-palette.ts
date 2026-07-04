// Validated categorical palette (fixed slot order — never cycled or re-ranked).
// Light-mode set; worst adjacent CVD ΔE 24.2.
export const CATEGORICAL = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
] as const

/** Categories beyond the 8 slots fold into "Other" (never generate a 9th hue). */
export const OTHER_COLOR = '#898781'

export const CHART_INK = {
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
} as const

export const SERIES = {
  sales: CATEGORICAL[0], // blue
  profit: CATEGORICAL[1], // aqua
} as const
