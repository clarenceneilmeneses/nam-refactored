import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  getMonth,
  getWeek,
  getWeekYear,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns'
import { toISODate } from '@/lib/format'

/**
 * Legacy-parity date logic from index.php/api.php. Quirks kept on purpose:
 * "This Quarter" starts Jan 1 (not the quarter start), weeks start Sunday,
 * All Time starts 2000-01-01.
 */

export type Period =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'all_time'
  | 'custom_month'
  | 'custom'

export type GroupBy = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type DrillKey = 'company' | 'category' | 'manager'
export type Drills = Record<DrillKey, string | null>

export type DashboardFilters = {
  period: Period
  /** 'yyyy-MM', used when period = custom_month */
  monthPick: string
  /** 'yyyy-MM-dd', used when period = custom */
  rangeStart: string
  rangeEnd: string
  /** Timeline bucketing, user-selectable only when period = custom */
  groupBy: GroupBy
  minTarget: number
  maxTarget: number
  drills: Drills
}

export const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all_time', label: 'All Time (Historical)' },
  { value: 'custom_month', label: 'Specific Month' },
  { value: 'custom', label: 'Custom Date Range' },
]

export const GROUP_BY_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'Yearly' },
]

export const NO_DRILLS: Drills = { company: null, category: null, manager: null }

export function defaultFilters(today = new Date()): DashboardFilters {
  return {
    period: 'month',
    monthPick: format(today, 'yyyy-MM'),
    rangeStart: toISODate(startOfMonth(today)),
    rangeEnd: toISODate(today),
    groupBy: 'day',
    minTarget: 100_000,
    maxTarget: 200_000,
    drills: NO_DRILLS,
  }
}

export type ResolvedRange = { start: string; end: string; groupBy: GroupBy }

export function resolveRange(filters: DashboardFilters, today = new Date()): ResolvedRange {
  const todayISO = toISODate(today)
  switch (filters.period) {
    case 'today':
      return { start: todayISO, end: todayISO, groupBy: 'day' }
    case 'week':
      return { start: toISODate(startOfWeek(today, { weekStartsOn: 0 })), end: todayISO, groupBy: 'day' }
    case 'month':
      return { start: toISODate(startOfMonth(today)), end: todayISO, groupBy: 'day' }
    case 'quarter':
      // Legacy quirk: "This Quarter" measures from Jan 1, bucketed by quarter.
      return { start: toISODate(startOfYear(today)), end: todayISO, groupBy: 'quarter' }
    case 'year':
      return { start: toISODate(startOfYear(today)), end: todayISO, groupBy: 'month' }
    case 'all_time':
      return { start: '2000-01-01', end: todayISO, groupBy: 'year' }
    case 'custom_month': {
      const first = parseISO(`${filters.monthPick}-01`)
      const isCurrentMonth = format(today, 'yyyy-MM') === filters.monthPick
      return {
        start: toISODate(first),
        end: isCurrentMonth ? todayISO : toISODate(endOfMonth(first)),
        groupBy: 'day',
      }
    }
    case 'custom':
      return { start: filters.rangeStart, end: filters.rangeEnd, groupBy: filters.groupBy }
  }
}

/** Lexicographic compare is safe: sales.date is 'yyyy-MM-dd'. */
export function inDateRange(date: string | null, range: { start: string; end: string }): boolean {
  if (!date) return false
  return date >= range.start && date <= range.end
}

export type Bucket = { key: string; label: string }

export function bucketOf(dateISO: string, groupBy: GroupBy): Bucket {
  const d = parseISO(dateISO)
  switch (groupBy) {
    case 'day':
      return { key: dateISO, label: format(d, 'MMM dd') }
    case 'week': {
      const week = getWeek(d)
      const year = getWeekYear(d)
      return { key: `${year}-W${String(week).padStart(2, '0')}`, label: `Week ${week}, ${year}` }
    }
    case 'month':
      return { key: dateISO.slice(0, 7), label: format(d, 'MMM yyyy') }
    case 'quarter': {
      const q = Math.floor(getMonth(d) / 3) + 1
      return { key: `${format(d, 'yyyy')}-Q${q}`, label: `Q${q} ${format(d, 'yyyy')}` }
    }
    case 'year':
      return { key: format(d, 'yyyy'), label: format(d, 'yyyy') }
  }
}

export const MONTHLY_TARGET_BASE = 2_500_000

/**
 * Revenue target scaled by period from the 2.5M/month base (legacy formula):
 * today /30, week /4, quarter ×month-of-quarter, year ×month number,
 * all_time ×36, custom /30 × days in range; month & specific month = base.
 */
export function scaledTarget(filters: DashboardFilters, range: ResolvedRange, today = new Date()): number {
  switch (filters.period) {
    case 'today':
      return MONTHLY_TARGET_BASE / 30
    case 'week':
      return MONTHLY_TARGET_BASE / 4
    case 'quarter':
      return MONTHLY_TARGET_BASE * ((getMonth(today) % 3) + 1)
    case 'year':
      return MONTHLY_TARGET_BASE * (getMonth(today) + 1)
    case 'all_time':
      return MONTHLY_TARGET_BASE * 36
    case 'custom': {
      const days = differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1
      return (MONTHLY_TARGET_BASE / 30) * Math.max(days, 1)
    }
    default:
      return MONTHLY_TARGET_BASE
  }
}

/** Growth badges compare against the previous calendar month of the range start. */
export function previousMonthRange(rangeStart: string): { start: string; end: string } {
  const prev = subMonths(parseISO(rangeStart), 1)
  return { start: toISODate(startOfMonth(prev)), end: toISODate(endOfMonth(prev)) }
}

/** Growth badges only render for these periods (legacy behaviour). */
export function showsGrowth(period: Period): boolean {
  return period === 'month' || period === 'custom_month' || period === 'year'
}

export type Growth = { percent: number; amount: number }

export function growthOf(current: number, previous: number): Growth {
  if (previous === 0) return { percent: current > 0 ? 100 : 0, amount: current }
  return { percent: ((current - previous) / previous) * 100, amount: current - previous }
}

export function hasActiveDrills(drills: Drills): boolean {
  return drills.company !== null || drills.category !== null || drills.manager !== null
}

/** Clicking an already-active bar/slice clears that drill (toggle). */
export function toggleDrill(drills: Drills, key: DrillKey, value: string): Drills {
  return { ...drills, [key]: drills[key] === value ? null : value }
}
