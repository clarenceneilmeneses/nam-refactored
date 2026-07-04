import { describe, expect, it } from 'vitest'
import {
  bucketOf,
  defaultFilters,
  growthOf,
  inDateRange,
  previousMonthRange,
  resolveRange,
  scaledTarget,
  showsGrowth,
  toggleDrill,
  NO_DRILLS,
} from './filters'

// A fixed "today" so period math is deterministic: Friday, 2026-07-03.
const TODAY = new Date(2026, 6, 3)

describe('resolveRange (legacy period logic)', () => {
  it('today: start = end = today', () => {
    expect(resolveRange(defaultFilters(TODAY), TODAY)).toEqual({
      start: '2026-07-01',
      end: '2026-07-03',
      groupBy: 'day',
    })
    expect(resolveRange({ ...defaultFilters(TODAY), period: 'today' }, TODAY)).toEqual({
      start: '2026-07-03',
      end: '2026-07-03',
      groupBy: 'day',
    })
  })

  it('week starts on Sunday', () => {
    // 2026-07-03 is a Friday; the Sunday before is 2026-06-28.
    expect(resolveRange({ ...defaultFilters(TODAY), period: 'week' }, TODAY)).toEqual({
      start: '2026-06-28',
      end: '2026-07-03',
      groupBy: 'day',
    })
  })

  it('quarter keeps the legacy Jan-1 quirk and groups by quarter', () => {
    expect(resolveRange({ ...defaultFilters(TODAY), period: 'quarter' }, TODAY)).toEqual({
      start: '2026-01-01',
      end: '2026-07-03',
      groupBy: 'quarter',
    })
  })

  it('year groups by month, all_time starts 2000-01-01 grouped by year', () => {
    expect(resolveRange({ ...defaultFilters(TODAY), period: 'year' }, TODAY).groupBy).toBe('month')
    expect(resolveRange({ ...defaultFilters(TODAY), period: 'all_time' }, TODAY)).toEqual({
      start: '2000-01-01',
      end: '2026-07-03',
      groupBy: 'year',
    })
  })

  it('specific month: past month ends on its last day, current month ends today', () => {
    const past = resolveRange({ ...defaultFilters(TODAY), period: 'custom_month', monthPick: '2026-02' }, TODAY)
    expect(past).toEqual({ start: '2026-02-01', end: '2026-02-28', groupBy: 'day' })
    const current = resolveRange({ ...defaultFilters(TODAY), period: 'custom_month', monthPick: '2026-07' }, TODAY)
    expect(current).toEqual({ start: '2026-07-01', end: '2026-07-03', groupBy: 'day' })
  })

  it('custom range uses the user-picked groupBy', () => {
    const r = resolveRange(
      { ...defaultFilters(TODAY), period: 'custom', rangeStart: '2026-01-01', rangeEnd: '2026-03-31', groupBy: 'month' },
      TODAY,
    )
    expect(r).toEqual({ start: '2026-01-01', end: '2026-03-31', groupBy: 'month' })
  })
})

describe('bucketOf labels', () => {
  it('formats each grouping like the legacy charts', () => {
    expect(bucketOf('2026-02-03', 'day')).toEqual({ key: '2026-02-03', label: 'Feb 03' })
    expect(bucketOf('2026-02-03', 'week').label).toBe('Week 6, 2026')
    expect(bucketOf('2026-02-03', 'month')).toEqual({ key: '2026-02', label: 'Feb 2026' })
    expect(bucketOf('2026-02-03', 'quarter')).toEqual({ key: '2026-Q1', label: 'Q1 2026' })
    expect(bucketOf('2026-02-03', 'year')).toEqual({ key: '2026', label: '2026' })
  })

  it('bucket keys sort chronologically', () => {
    expect(bucketOf('2026-01-15', 'quarter').key < bucketOf('2026-04-01', 'quarter').key).toBe(true)
    expect(bucketOf('2025-12-31', 'month').key < bucketOf('2026-01-01', 'month').key).toBe(true)
  })
})

describe('scaledTarget (2.5M/month base)', () => {
  const f = defaultFilters(TODAY)
  const range = (period: (typeof f)['period']) => resolveRange({ ...f, period }, TODAY)

  it('scales per period', () => {
    expect(scaledTarget({ ...f, period: 'today' }, range('today'), TODAY)).toBeCloseTo(2_500_000 / 30)
    expect(scaledTarget({ ...f, period: 'week' }, range('week'), TODAY)).toBeCloseTo(625_000)
    expect(scaledTarget({ ...f, period: 'month' }, range('month'), TODAY)).toBe(2_500_000)
    // July is month 1 of Q3.
    expect(scaledTarget({ ...f, period: 'quarter' }, range('quarter'), TODAY)).toBe(2_500_000)
    // July = month 7.
    expect(scaledTarget({ ...f, period: 'year' }, range('year'), TODAY)).toBe(17_500_000)
    expect(scaledTarget({ ...f, period: 'all_time' }, range('all_time'), TODAY)).toBe(90_000_000)
  })

  it('custom range: /30 × inclusive day count', () => {
    const custom = { ...f, period: 'custom' as const, rangeStart: '2026-06-01', rangeEnd: '2026-06-30' }
    expect(scaledTarget(custom, resolveRange(custom, TODAY), TODAY)).toBeCloseTo(2_500_000)
  })
})

describe('growth vs previous calendar month', () => {
  it('previous month of the range start', () => {
    expect(previousMonthRange('2026-07-01')).toEqual({ start: '2026-06-01', end: '2026-06-30' })
    // Year period starts Jan 1 → compares against December of the prior year.
    expect(previousMonthRange('2026-01-01')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  it('growth math handles a zero previous period', () => {
    expect(growthOf(1100, 1000)).toEqual({ percent: 10, amount: 100 })
    expect(growthOf(500, 0)).toEqual({ percent: 100, amount: 500 })
    expect(growthOf(0, 0)).toEqual({ percent: 0, amount: 0 })
  })

  it('badges only show for month / specific-month / year', () => {
    expect(showsGrowth('month')).toBe(true)
    expect(showsGrowth('custom_month')).toBe(true)
    expect(showsGrowth('year')).toBe(true)
    expect(showsGrowth('week')).toBe(false)
    expect(showsGrowth('all_time')).toBe(false)
  })
})

describe('drills and range membership', () => {
  it('toggleDrill sets, replaces, and clears on re-click', () => {
    const set = toggleDrill(NO_DRILLS, 'company', 'ACME')
    expect(set.company).toBe('ACME')
    expect(toggleDrill(set, 'company', 'ACME').company).toBeNull()
    expect(toggleDrill(set, 'company', 'Other').company).toBe('Other')
  })

  it('inDateRange is inclusive and rejects nulls', () => {
    const range = { start: '2026-07-01', end: '2026-07-03' }
    expect(inDateRange('2026-07-01', range)).toBe(true)
    expect(inDateRange('2026-07-03', range)).toBe(true)
    expect(inDateRange('2026-06-30', range)).toBe(false)
    expect(inDateRange(null, range)).toBe(false)
  })
})
