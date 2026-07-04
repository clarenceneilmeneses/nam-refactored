import { format, parseISO } from 'date-fns'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const pesoWhole = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatPeso(value: number | null | undefined): string {
  return peso.format(value ?? 0)
}

export function formatPesoWhole(value: number | null | undefined): string {
  return pesoWhole.format(value ?? 0)
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  return `${(value ?? 0).toFixed(digits)}%`
}

/** Displays dates as "MMM d, yyyy" per the build spec. Accepts date or timestamp strings. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return value
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'MMM d, yyyy h:mm a')
  } catch {
    return value
  }
}

const manilaDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** "MMM d, yyyy, h:mm AM/PM" pinned to Asia/Manila regardless of the viewer's timezone. */
export function formatDateTimeManila(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return manilaDateTime.format(parseISO(value))
  } catch {
    return value
  }
}

/** yyyy-MM-dd for date inputs and Supabase date columns. */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
