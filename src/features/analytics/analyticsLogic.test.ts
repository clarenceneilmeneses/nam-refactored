import { describe, expect, it } from 'vitest'
import type { SaleRow } from '@/types/database'
import { NO_DRILLS } from '../dashboard/filters'
import {
  buildInsights,
  buildRecords,
  collectionByMonth,
  filterAnalyticsRows,
  marginByOrderSize,
  milestoneStatus,
  momOf,
  monthlySeries,
  onTimeCollection,
  orderValueMarginR,
  receivablesAging,
  repeatClientShare,
  seasonalityYoY,
  topShares,
  weekdayPattern,
  weeklyTrend,
  yearsPresent,
  yoyComparison,
} from './analyticsLogic'

function sale(patch: Partial<SaleRow>): SaleRow {
  return {
    id: 1,
    date: '2026-01-05',
    sn: null,
    po_number: null,
    company: null,
    category: null,
    item: null,
    quantity_requested: null,
    suppliers_price: null,
    total_actual_amount: null,
    nam_unit_price: null,
    total_nam_amount: null,
    total_nam_amount_sub_total: null,
    income: null,
    income_percent: null,
    date_delivered: null,
    payment_term: null,
    due_date: null,
    payment_status: null,
    date_paid: null,
    si_number: null,
    buyer: null,
    remarks: null,
    supplier: null,
    address: null,
    tin: null,
    si_reviewed: false,
    si_reviewed_by: null,
    si_reviewed_at: null,
    dr_number: null,
    sales_invoice_no: null,
    contact_person_contact: null,
    created_at: '2026-01-05T00:00:00Z',
    is_reserved: null,
    withholding_tax: null,
    total_amount_due: null,
    ...patch,
  }
}

describe('yearsPresent / filterAnalyticsRows', () => {
  const rows = [
    sale({ date: '2025-03-01', company: 'Acme' }),
    sale({ date: '2026-01-10', company: 'Beta' }),
    sale({ date: '2026-06-02', company: 'Acme' }),
  ]

  it('lists distinct years newest first', () => {
    expect(yearsPresent(rows)).toEqual(['2026', '2025'])
  })

  it('filters by year and drills together', () => {
    const lookup = new Map<string, string>()
    expect(filterAnalyticsRows(rows, '2026', NO_DRILLS, lookup)).toHaveLength(2)
    expect(filterAnalyticsRows(rows, '2026', { ...NO_DRILLS, company: 'Acme' }, lookup)).toHaveLength(1)
    expect(filterAnalyticsRows(rows, 'all', NO_DRILLS, lookup)).toHaveLength(3)
  })

  it('treats legacy typo dates (year 0206 etc.) as noise everywhere', () => {
    const dirty = [...rows, sale({ date: '0206-02-15' }), sale({ date: '0004-11-30' })]
    expect(yearsPresent(dirty)).toEqual(['2026', '2025'])
    expect(filterAnalyticsRows(dirty, 'all', NO_DRILLS, new Map())).toHaveLength(3)
    // A typo sale date paid in the real present would otherwise read as ~660k days.
    const paid = [sale({ date: '0206-02-15', date_paid: '2026-02-20' }), sale({ date: '2026-02-01', date_paid: '2026-02-20' })]
    const points = collectionByMonth(paid)
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ key: '2026-02', avgDays: 19, invoices: 1 })
  })
})

describe('monthlySeries / momOf', () => {
  const rows = [
    sale({ date: '2026-01-05', total_nam_amount: 100, income: 20 }),
    sale({ date: '2026-01-20', total_nam_amount: 100, income: 30 }),
    sale({ date: '2026-02-10', total_nam_amount: 300, income: 60 }),
  ]

  it('aggregates revenue, profit, margin and orders per month', () => {
    const series = monthlySeries(rows)
    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ key: '2026-01', revenue: 200, profit: 50, margin: 25, orders: 2 })
    expect(series[1]).toMatchObject({ key: '2026-02', revenue: 300, orders: 1 })
  })

  it('computes MoM against the prior month', () => {
    const series = monthlySeries(rows)
    expect(momOf(series, (p) => p.revenue)).toEqual({ percent: 50, amount: 100 })
    expect(momOf(series.slice(0, 1), (p) => p.revenue)).toBeNull()
  })
})

describe('weekdayPattern', () => {
  it('buckets Mon-first and flags peak + below-average days', () => {
    // 2026-01-05 is a Monday, 2026-01-10 a Saturday: a 6-day span, one of each Mon–Sat.
    const rows = [
      sale({ date: '2026-01-05', total_nam_amount: 700 }),
      sale({ date: '2026-01-10', total_nam_amount: 70 }),
    ]
    const pattern = weekdayPattern(rows)
    expect(pattern[0]).toMatchObject({ day: 'Mon', revenue: 700, avg: 700, occurrences: 1, peak: true, belowAvg: false })
    expect(pattern[5]).toMatchObject({ day: 'Sat', revenue: 70, avg: 70, occurrences: 1, peak: false, belowAvg: true })
    expect(pattern[6]).toMatchObject({ day: 'Sun', revenue: 0, avg: 0, occurrences: 0, belowAvg: true })
  })

  it('averages each weekday over how many of them the date span contains', () => {
    // Three consecutive Mondays: the span holds 3 Mondays and 2 of every other day.
    const rows = [
      sale({ date: '2026-01-05', total_nam_amount: 100 }),
      sale({ date: '2026-01-12', total_nam_amount: 200 }),
      sale({ date: '2026-01-19', total_nam_amount: 300 }),
    ]
    const pattern = weekdayPattern(rows)
    expect(pattern[0]).toMatchObject({ day: 'Mon', revenue: 600, avg: 200, occurrences: 3 })
    expect(pattern[1]).toMatchObject({ day: 'Tue', revenue: 0, avg: 0, occurrences: 2 })
  })
})

describe('seasonalityYoY / yoyComparison', () => {
  const rows = [
    sale({ date: '2025-01-15', total_nam_amount: 100 }),
    sale({ date: '2025-02-15', total_nam_amount: 100 }),
    sale({ date: '2026-01-15', total_nam_amount: 150 }),
  ]

  it('pairs the latest year with the one before, per calendar month', () => {
    const s = seasonalityYoY(rows)
    expect(s?.currentYear).toBe('2026')
    expect(s?.previousYear).toBe('2025')
    expect(s?.points[0]).toEqual({ month: 'Jan', current: 150, previous: 100 })
    expect(s?.points[1]).toEqual({ month: 'Feb', current: null, previous: 100 })
  })

  it('compares only overlapping months', () => {
    const yoy = yoyComparison(seasonalityYoY(rows))
    expect(yoy).toEqual({ percent: 50, currentTotal: 150, previousTotal: 100 })
  })

  it('is null when there is no overlap', () => {
    expect(yoyComparison(seasonalityYoY([sale({ date: '2026-03-01', total_nam_amount: 10 })]))).toBeNull()
  })
})

describe('collection metrics', () => {
  it('averages days to payment per sale month and flags target breaches', () => {
    const rows = [
      sale({ date: '2026-01-01', date_paid: '2026-01-11' }), // 10 days
      sale({ date: '2026-01-01', date_paid: '2026-03-02' }), // 60 days
      sale({ date: '2026-01-15', date_paid: '2026-01-10' }), // negative → skipped
      sale({ date: '2026-02-01' }), // unpaid → skipped
    ]
    const points = collectionByMonth(rows)
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ key: '2026-01', avgDays: 35, invoices: 2, breach: true })
  })

  it('computes on-time percentage against due dates', () => {
    const rows = [
      sale({ date_paid: '2026-01-10', due_date: '2026-01-15' }),
      sale({ date_paid: '2026-01-20', due_date: '2026-01-15' }),
      sale({ date_paid: '2026-01-20' }), // no due date → excluded
    ]
    expect(onTimeCollection(rows)).toEqual({ percent: 50, onTime: 1, total: 2 })
  })
})

describe('repeatClientShare / topShares', () => {
  const rows = [
    sale({ company: 'Acme', total_nam_amount: 100, category: 'PPE' }),
    sale({ company: 'Acme', total_nam_amount: 100, category: 'PPE' }),
    sale({ company: 'Solo', total_nam_amount: 50, category: 'MATERIALS' }),
  ]

  it('attributes revenue from clients with more than one order', () => {
    const share = repeatClientShare(rows)
    expect(share.percent).toBeCloseTo(80)
    expect(share).toMatchObject({ repeatRevenue: 200, totalRevenue: 250, repeatClients: 1 })
  })

  it('finds the biggest company, category and manager with their share', () => {
    const lookup = new Map([['acme', 'Anne']])
    const shares = topShares(rows, lookup)
    expect(shares[0]).toMatchObject({ kind: 'Company', name: 'Acme', total: 200 })
    expect(shares[0].percent).toBeCloseTo(80)
    expect(shares[1]).toMatchObject({ kind: 'Category', name: 'PPE' })
    expect(shares[2]).toMatchObject({ kind: 'Manager', name: 'Anne' })
  })
})

describe('order size vs margin', () => {
  it('bins orders by value and averages margin, dropping empty bins', () => {
    const rows = [
      sale({ total_nam_amount: 5_000, income_percent: 30 }),
      sale({ total_nam_amount: 8_000, income_percent: 20 }),
      sale({ total_nam_amount: 300_000, income_percent: 10 }),
    ]
    const bins = marginByOrderSize(rows)
    expect(bins).toEqual([
      { label: '<₱10k', avgMargin: 25, orders: 2 },
      { label: '≥₱250k', avgMargin: 10, orders: 1 },
    ])
  })

  it('returns a negative r when margin falls as value rises, null when degenerate', () => {
    const rows = [
      sale({ total_nam_amount: 1_000, income_percent: 30 }),
      sale({ total_nam_amount: 10_000, income_percent: 20 }),
      sale({ total_nam_amount: 100_000, income_percent: 10 }),
    ]
    expect(orderValueMarginR(rows)).toBeLessThan(0)
    expect(orderValueMarginR(rows.slice(0, 2))).toBeNull()
  })
})

describe('buildInsights', () => {
  const month = (key: string, revenue: number, patch = {}) => ({
    key,
    label: key,
    revenue,
    profit: revenue * 0.2,
    margin: 20,
    orders: 10,
    ...patch,
  })
  const empty = {
    monthly: [],
    weekday: [],
    seasonality: null,
    yoy: null,
    avgCollectionDays: null,
    onTime: { percent: 0, onTime: 0, total: 0 },
    repeat: { percent: 0, repeatRevenue: 0, totalRevenue: 0, repeatClients: 0 },
    shares: [],
    r: null,
  }

  it('reports growth between the last two complete months in plain language', () => {
    const insights = buildInsights({ ...empty, monthly: [month('2026-05', 100), month('2026-06', 150)] }, '2026-07-14')
    expect(insights[0]).toMatchObject({ icon: 'trending_up', tone: 'good' })
    expect(insights[0].headline).toContain('grew 50%')
    expect(insights[0].headline).toContain('June 2026')
  })

  it('never judges the running month — it is reported as "so far"', () => {
    const insights = buildInsights(
      { ...empty, monthly: [month('2026-05', 100), month('2026-06', 150), month('2026-07', 20)] },
      '2026-07-14',
    )
    expect(insights[0].headline).toContain('June 2026') // not a 87% crash for July
    expect(insights[0].detail).toContain('so far')
  })

  it('calls small movements level, and drops the growth insight with one month', () => {
    const level = buildInsights({ ...empty, monthly: [month('2026-05', 100), month('2026-06', 101)] }, '2026-07-14')
    expect(level[0]).toMatchObject({ icon: 'trending_flat', tone: 'neutral' })
    expect(buildInsights({ ...empty, monthly: [month('2026-06', 100)] }, '2026-07-14')).toHaveLength(1) // only best-month
  })

  it('grades collection speed against the 30-day target', () => {
    const good = buildInsights({ ...empty, avgCollectionDays: 25 }, '2026-07-14')
    expect(good[0]).toMatchObject({ tone: 'good', headline: 'Clients pay within the target' })
    const warn = buildInsights({ ...empty, avgCollectionDays: 40 }, '2026-07-14')
    expect(warn[0]).toMatchObject({ tone: 'warning', headline: 'Payments run 10 days over target' })
    expect(buildInsights({ ...empty, avgCollectionDays: 70 }, '2026-07-14')[0].tone).toBe('critical')
  })

  it('warns when one client dominates revenue', () => {
    const base = {
      ...empty,
      repeat: { percent: 80, repeatRevenue: 800, totalRevenue: 1000, repeatClients: 4 },
      shares: [{ kind: 'Company' as const, name: 'Acme', percent: 45, total: 450 }],
    }
    const [concentration, repeat] = buildInsights(base, '2026-07-14')
    expect(concentration).toMatchObject({ tone: 'warning' })
    expect(concentration.headline).toContain('Acme')
    expect(repeat).toMatchObject({ tone: 'good', headline: 'Most revenue comes from returning clients' })
  })

  it('translates the order-size correlation without exposing r', () => {
    expect(buildInsights({ ...empty, r: -0.6 }, '2026-07-14')[0].headline).toBe('Bigger orders earn thinner margins')
    expect(buildInsights({ ...empty, r: 0.05 }, '2026-07-14')[0].headline).toBe('Margins are steady across order sizes')
    const all = buildInsights({ ...empty, r: -0.6 }, '2026-07-14')
    expect(all.every((i) => !i.detail.includes('r ='))).toBe(true)
  })
})

describe('buildRecords', () => {
  it('surfaces best month, best day, biggest order and a growth streak', () => {
    const rows = [
      sale({ date: '2026-01-05', company: 'Acme', total_nam_amount: 100, income: 20 }),
      sale({ date: '2026-01-05', company: 'Acme', total_nam_amount: 900, income: 100 }), // Jan 5 day total 1000
      sale({ date: '2026-02-10', company: 'Beta', total_nam_amount: 500, income: 50 }),
      sale({ date: '2026-03-10', company: 'Beta', total_nam_amount: 1500, income: 200 }), // biggest month, day and order
    ]
    const records = buildRecords(rows, monthlySeries(rows))
    const byLabel = Object.fromEntries(records.map((r) => [r.label, r]))
    expect(byLabel['Best month'].value).toBe('₱1,500.00') // March
    expect(byLabel['Best single day'].value).toBe('₱1,500.00') // Mar 10 beats Jan 5's ₱1,000
    expect(byLabel['Biggest single order'].value).toBe('₱1,500.00')
    expect(byLabel['Biggest single order'].detail).toContain('Beta')
    // Jan 1000 → Feb 500 → Mar 1500 never rises 3 straight months, so no streak record.
    expect(byLabel['Longest growth streak']).toBeUndefined()
  })

  it('reports a growth streak of 3+ consecutive rising months', () => {
    const rows = [
      sale({ date: '2026-01-10', total_nam_amount: 100 }),
      sale({ date: '2026-02-10', total_nam_amount: 200 }),
      sale({ date: '2026-03-10', total_nam_amount: 300 }),
      sale({ date: '2026-04-10', total_nam_amount: 400 }),
    ]
    const streak = buildRecords(rows, monthlySeries(rows)).find((r) => r.label === 'Longest growth streak')
    expect(streak?.value).toBe('4 months')
  })
})

describe('milestoneStatus', () => {
  it('tracks cumulative revenue past thresholds and toward the next', () => {
    const monthly = monthlySeries([
      sale({ date: '2026-01-10', total_nam_amount: 600_000 }),
      sale({ date: '2026-02-10', total_nam_amount: 700_000 }), // cumulative 1.3M crosses ₱1M in Feb
    ])
    const status = milestoneStatus(monthly)
    expect(status.lifetime).toBe(1_300_000)
    expect(status.reached).toEqual({ threshold: 1_000_000, monthKey: '2026-02' })
    expect(status.next).toBe(2_500_000)
    expect(status.progress).toBeCloseTo((1_300_000 / 2_500_000) * 100)
  })

  it('has no reached milestone below the first million', () => {
    const status = milestoneStatus(monthlySeries([sale({ date: '2026-01-10', total_nam_amount: 400_000 })]))
    expect(status.reached).toBeNull()
    expect(status.next).toBe(1_000_000)
  })
})

describe('receivablesAging', () => {
  it('buckets unpaid invoices by age and ranks the largest debtors', () => {
    const rows = [
      sale({ date: '2026-07-10', company: 'Acme', total_nam_amount: 100, payment_status: 'Unpaid' }), // 4 days old
      sale({ date: '2026-05-01', company: 'Acme', total_nam_amount: 500, payment_status: 'Unpaid', due_date: '2026-06-01' }), // 74 days, overdue
      sale({ date: '2026-03-01', company: 'Beta', total_nam_amount: 300, payment_status: 'Pending' }), // 135 days
      sale({ date: '2026-07-01', company: 'Gamma', total_nam_amount: 999, payment_status: 'Paid' }), // excluded
    ]
    const aging = receivablesAging(rows, '2026-07-14')
    expect(aging.totalUnpaid).toBe(900)
    expect(aging.invoices).toBe(3)
    expect(aging.overdue).toEqual({ amount: 500, invoices: 1 })
    const byLabel = Object.fromEntries(aging.buckets.map((b) => [b.label, b]))
    expect(byLabel['0–30 days']).toMatchObject({ amount: 100, invoices: 1 })
    expect(byLabel['61–90 days']).toMatchObject({ amount: 500, invoices: 1 })
    expect(byLabel['Over 90 days']).toMatchObject({ amount: 300, invoices: 1 })
    expect(aging.debtors[0]).toMatchObject({ company: 'Acme', amount: 600, invoices: 2, oldestDays: 74 })
  })

  it('is empty when everything is paid', () => {
    const aging = receivablesAging([sale({ total_nam_amount: 100, payment_status: 'Paid' })], '2026-07-14')
    expect(aging.totalUnpaid).toBe(0)
    expect(aging.debtors).toHaveLength(0)
  })
})

describe('weeklyTrend', () => {
  it('marks direction vs previous week and fills MA4 from the 4th week', () => {
    const rows = [
      sale({ date: '2026-01-05', total_nam_amount: 100 }),
      sale({ date: '2026-01-12', total_nam_amount: 200 }),
      sale({ date: '2026-01-19', total_nam_amount: 100 }),
      sale({ date: '2026-01-26', total_nam_amount: 200 }),
    ]
    const weeks = weeklyTrend(rows)
    expect(weeks.map((w) => w.dir)).toEqual(['first', 'up', 'down', 'up'])
    expect(weeks[2].ma4).toBeNull()
    expect(weeks[3].ma4).toBe(150)
  })
})
