import { differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import { round2 } from '@/lib/calculations'
import type { SaleRow } from '@/types/database'
import { categoryKey, companyKey, managerOf, type ManagerLookup } from '../dashboard/aggregate'
import { bucketOf, type Drills } from '../dashboard/filters'

/**
 * Analytics = patterns over time (trends, seasonality, weekday load, collection
 * discipline), deliberately complementary to the Executive Dashboard's period
 * snapshot. Everything is pure and client-side, like dashboard/aggregate.ts.
 */

export type YearFilter = 'all' | string

/**
 * Legacy MySQL typo dates (year 0206, 0004, …) survive as valid ISO strings and
 * would poison every time-based aggregate, so anything outside 2000–2099 is
 * treated as noise — same floor as the Dashboard's "All Time starts 2000-01-01".
 */
export function saneDate(d: string | null): d is string {
  return d !== null && d >= '2000-01-01' && d < '2100-01-01'
}

/** Distinct years present in the data, newest first. */
export function yearsPresent(rows: SaleRow[]): string[] {
  const years = new Set<string>()
  for (const r of rows) {
    if (saneDate(r.date)) years.add(r.date.slice(0, 4))
  }
  return [...years].sort().reverse()
}

/** Year + the shared dashboard drills (company / category / manager). */
export function filterAnalyticsRows(
  rows: SaleRow[],
  year: YearFilter,
  drills: Drills,
  lookup: ManagerLookup,
): SaleRow[] {
  return rows.filter((row) => {
    if (!saneDate(row.date)) return false
    if (year !== 'all' && row.date.slice(0, 4) !== year) return false
    if (drills.company !== null && companyKey(row) !== drills.company) return false
    if (drills.category !== null && categoryKey(row) !== drills.category) return false
    if (drills.manager !== null && managerOf(lookup, row.company) !== drills.manager) return false
    return true
  })
}

// ---------------------------------------------------------------- Monthly trends

export type MonthPoint = {
  /** 'yyyy-MM' */
  key: string
  label: string
  revenue: number
  profit: number
  margin: number
  orders: number
}

/** Months present in the data, chronological (no gap filling — legacy parity). */
export function monthlySeries(rows: SaleRow[]): MonthPoint[] {
  const byMonth = new Map<string, { revenue: number; profit: number; orders: number }>()
  for (const r of rows) {
    if (!r.date) continue
    const key = r.date.slice(0, 7)
    const m = byMonth.get(key) ?? { revenue: 0, profit: 0, orders: 0 }
    m.revenue += r.total_nam_amount ?? 0
    m.profit += r.income ?? 0
    m.orders += 1
    byMonth.set(key, m)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => ({
      key,
      label: format(parseISO(`${key}-01`), 'MMM yy'),
      revenue: round2(m.revenue),
      profit: round2(m.profit),
      margin: m.revenue > 0 ? round2((m.profit / m.revenue) * 100) : 0,
      orders: m.orders,
    }))
}

export type Mom = { percent: number; amount: number }

/** Month-over-month delta of the last two points; null with fewer than 2 months. */
export function momOf(series: MonthPoint[], pick: (p: MonthPoint) => number): Mom | null {
  if (series.length < 2) return null
  const current = pick(series[series.length - 1])
  const previous = pick(series[series.length - 2])
  if (previous === 0) return { percent: current > 0 ? 100 : 0, amount: current }
  return { percent: ((current - previous) / previous) * 100, amount: current - previous }
}

export function seriesAvg(series: MonthPoint[], pick: (p: MonthPoint) => number): number {
  if (series.length === 0) return 0
  return series.reduce((sum, p) => sum + pick(p), 0) / series.length
}

export function seriesPeak(series: MonthPoint[], pick: (p: MonthPoint) => number): MonthPoint | null {
  if (series.length === 0) return null
  return series.reduce((best, p) => (pick(p) > pick(best) ? p : best))
}

// ---------------------------------------------------------------- Day-of-week pattern

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type WeekdayPoint = {
  day: (typeof WEEKDAYS)[number]
  revenue: number
  orders: number
  belowAvg: boolean
  peak: boolean
}

/** Revenue by day of week (Mon-first), flagging the peak and below-average days. */
export function weekdayPattern(rows: SaleRow[]): WeekdayPoint[] {
  const totals = WEEKDAYS.map(() => ({ revenue: 0, orders: 0 }))
  for (const r of rows) {
    if (!r.date) continue
    const index = (getDay(parseISO(r.date)) + 6) % 7 // JS Sunday=0 → Mon-first
    totals[index].revenue += r.total_nam_amount ?? 0
    totals[index].orders += 1
  }
  const avg = totals.reduce((s, t) => s + t.revenue, 0) / 7
  const max = Math.max(...totals.map((t) => t.revenue))
  return WEEKDAYS.map((day, i) => ({
    day,
    revenue: round2(totals[i].revenue),
    orders: totals[i].orders,
    belowAvg: totals[i].revenue < avg,
    peak: max > 0 && totals[i].revenue === max,
  }))
}

// ---------------------------------------------------------------- Seasonality (YoY)

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export type SeasonalityPoint = { month: string; current: number | null; previous: number | null }
export type Seasonality = { points: SeasonalityPoint[]; currentYear: string; previousYear: string }

/** Latest year in the data vs the year before, revenue per calendar month. */
export function seasonalityYoY(rows: SaleRow[]): Seasonality | null {
  const years = yearsPresent(rows)
  if (years.length === 0) return null
  const currentYear = years[0]
  const previousYear = String(Number(currentYear) - 1)
  const sums = new Map<string, number>()
  for (const r of rows) {
    if (!r.date) continue
    const key = r.date.slice(0, 7)
    sums.set(key, (sums.get(key) ?? 0) + (r.total_nam_amount ?? 0))
  }
  const monthOf = (year: string, m: number): number | null => {
    const v = sums.get(`${year}-${String(m + 1).padStart(2, '0')}`)
    return v === undefined ? null : round2(v)
  }
  return {
    currentYear,
    previousYear,
    points: MONTH_LABELS.map((month, m) => ({
      month,
      current: monthOf(currentYear, m),
      previous: monthOf(previousYear, m),
    })),
  }
}

export type YoyComparison = { percent: number; currentTotal: number; previousTotal: number }

/** Current vs previous year over the months both have data for; null when they never overlap. */
export function yoyComparison(seasonality: Seasonality | null): YoyComparison | null {
  if (!seasonality) return null
  let currentTotal = 0
  let previousTotal = 0
  let overlaps = 0
  for (const p of seasonality.points) {
    if (p.current !== null && p.previous !== null) {
      currentTotal += p.current
      previousTotal += p.previous
      overlaps += 1
    }
  }
  if (overlaps === 0 || previousTotal === 0) return null
  return {
    percent: ((currentTotal - previousTotal) / previousTotal) * 100,
    currentTotal: round2(currentTotal),
    previousTotal: round2(previousTotal),
  }
}

// ---------------------------------------------------------------- Collection discipline

export const COLLECTION_TARGET_DAYS = 30

export type CollectionPoint = {
  key: string
  label: string
  avgDays: number
  invoices: number
  breach: boolean
}

/**
 * Average days from sale date to payment, per month of sale. Only rows with a
 * date_paid count; negative gaps (data-entry noise) are skipped.
 */
export function collectionByMonth(rows: SaleRow[], targetDays = COLLECTION_TARGET_DAYS): CollectionPoint[] {
  const byMonth = new Map<string, { totalDays: number; invoices: number }>()
  for (const r of rows) {
    if (!saneDate(r.date) || !saneDate(r.date_paid)) continue
    const days = differenceInCalendarDays(parseISO(r.date_paid), parseISO(r.date))
    if (days < 0) continue
    const key = r.date.slice(0, 7)
    const m = byMonth.get(key) ?? { totalDays: 0, invoices: 0 }
    m.totalDays += days
    m.invoices += 1
    byMonth.set(key, m)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => {
      const avgDays = round2(m.totalDays / m.invoices)
      return {
        key,
        label: format(parseISO(`${key}-01`), 'MMM yy'),
        avgDays,
        invoices: m.invoices,
        breach: avgDays > targetDays,
      }
    })
}

export type OnTimeCollection = { percent: number; onTime: number; total: number }

/** Of paid invoices that have a due date: % paid on or before it. */
export function onTimeCollection(rows: SaleRow[]): OnTimeCollection {
  let onTime = 0
  let total = 0
  for (const r of rows) {
    if (!r.date_paid || !r.due_date) continue
    total += 1
    if (r.date_paid <= r.due_date) onTime += 1
  }
  return { percent: total > 0 ? (onTime / total) * 100 : 0, onTime, total }
}

export type RepeatShare = { percent: number; repeatRevenue: number; totalRevenue: number; repeatClients: number }

/** Revenue share coming from clients with more than one order in the filtered set. */
export function repeatClientShare(rows: SaleRow[]): RepeatShare {
  const orders = new Map<string, number>()
  for (const r of rows) orders.set(companyKey(r), (orders.get(companyKey(r)) ?? 0) + 1)
  let repeatRevenue = 0
  let totalRevenue = 0
  for (const r of rows) {
    const amount = r.total_nam_amount ?? 0
    totalRevenue += amount
    if ((orders.get(companyKey(r)) ?? 0) > 1) repeatRevenue += amount
  }
  return {
    percent: totalRevenue > 0 ? (repeatRevenue / totalRevenue) * 100 : 0,
    repeatRevenue: round2(repeatRevenue),
    totalRevenue: round2(totalRevenue),
    repeatClients: [...orders.values()].filter((n) => n > 1).length,
  }
}

// ---------------------------------------------------------------- Order size vs margin

export type MarginBin = { label: string; avgMargin: number; orders: number }

const BIN_EDGES: Array<{ label: string; min: number; max: number }> = [
  { label: '<₱10k', min: 0, max: 10_000 },
  { label: '₱10–50k', min: 10_000, max: 50_000 },
  { label: '₱50–100k', min: 50_000, max: 100_000 },
  { label: '₱100–250k', min: 100_000, max: 250_000 },
  { label: '≥₱250k', min: 250_000, max: Infinity },
]

/** Average margin% per order-value bin (empty bins dropped). */
export function marginByOrderSize(rows: SaleRow[]): MarginBin[] {
  const bins = BIN_EDGES.map(() => ({ totalMargin: 0, orders: 0 }))
  for (const r of rows) {
    const value = r.total_nam_amount ?? 0
    if (value <= 0 || r.income_percent === null) continue
    const i = BIN_EDGES.findIndex((b) => value >= b.min && value < b.max)
    if (i === -1) continue
    bins[i].totalMargin += r.income_percent
    bins[i].orders += 1
  }
  return BIN_EDGES.map((edge, i) => ({
    label: edge.label,
    avgMargin: bins[i].orders > 0 ? round2(bins[i].totalMargin / bins[i].orders) : 0,
    orders: bins[i].orders,
  })).filter((b) => b.orders > 0)
}

/** Pearson r between order value and margin%; null when it isn't meaningful (<3 rows or zero variance). */
export function orderValueMarginR(rows: SaleRow[]): number | null {
  const pairs: Array<[number, number]> = []
  for (const r of rows) {
    const value = r.total_nam_amount ?? 0
    if (value <= 0 || r.income_percent === null) continue
    pairs.push([value, r.income_percent])
  }
  if (pairs.length < 3) return null
  const n = pairs.length
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n
  let cov = 0
  let varX = 0
  let varY = 0
  for (const [x, y] of pairs) {
    cov += (x - meanX) * (y - meanY)
    varX += (x - meanX) ** 2
    varY += (y - meanY) ** 2
  }
  if (varX === 0 || varY === 0) return null
  return cov / Math.sqrt(varX * varY)
}

// ---------------------------------------------------------------- Weekly trend + moving average

export type WeekPoint = {
  key: string
  label: string
  revenue: number
  /** Trailing 4-week moving average; null for the first 3 weeks. */
  ma4: number | null
  dir: 'up' | 'down' | 'first'
}

export function weeklyTrend(rows: SaleRow[]): WeekPoint[] {
  const byWeek = new Map<string, { label: string; revenue: number }>()
  for (const r of rows) {
    if (!r.date) continue
    const { key, label } = bucketOf(r.date, 'week')
    const w = byWeek.get(key) ?? { label, revenue: 0 }
    w.revenue += r.total_nam_amount ?? 0
    byWeek.set(key, w)
  }
  const sorted = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))
  return sorted.map(([key, w], i) => {
    const window = sorted.slice(Math.max(0, i - 3), i + 1)
    return {
      key,
      label: w.label,
      revenue: round2(w.revenue),
      ma4: window.length === 4 ? round2(window.reduce((s, [, x]) => s + x.revenue, 0) / 4) : null,
      dir: i === 0 ? 'first' : w.revenue >= sorted[i - 1][1].revenue ? 'up' : 'down',
    }
  })
}

// ---------------------------------------------------------------- Concentration shares

export type TopShare = { kind: 'Company' | 'Category' | 'Manager'; name: string; percent: number; total: number }

/** The single biggest company / category / manager and their revenue share. */
export function topShares(rows: SaleRow[], lookup: ManagerLookup): TopShare[] {
  const totalRevenue = rows.reduce((s, r) => s + (r.total_nam_amount ?? 0), 0)
  const topOf = (kind: TopShare['kind'], keyOf: (r: SaleRow) => string): TopShare | null => {
    const sums = new Map<string, number>()
    for (const r of rows) sums.set(keyOf(r), (sums.get(keyOf(r)) ?? 0) + (r.total_nam_amount ?? 0))
    let best: TopShare | null = null
    for (const [name, total] of sums) {
      if (!best || total > best.total) {
        best = { kind, name, total: round2(total), percent: totalRevenue > 0 ? (total / totalRevenue) * 100 : 0 }
      }
    }
    return best
  }
  return [
    topOf('Company', companyKey),
    topOf('Category', categoryKey),
    topOf('Manager', (r) => managerOf(lookup, r.company)),
  ].filter((s): s is TopShare => s !== null)
}
