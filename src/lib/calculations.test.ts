import { describe, expect, it } from 'vitest'
import {
  computeDueDate,
  computeProductMargin,
  computeQuotationTotal,
  computeSaleLine,
  isOverdue,
  parseCurrency,
  parsePaymentTermDays,
  round2,
  stockValue,
} from './calculations'

// Expectations below use real rows from the migrated dataset (02_data.sql)
// so the port is checked against what the legacy PHP actually stored.

describe('computeSaleLine', () => {
  it('matches sale #1 (with withholding tax)', () => {
    // 5 × 137.60 supplier, 5 × 276.75 NAM, WHT applied
    const t = computeSaleLine({ quantity: 5, suppliersPrice: 137.6, namUnitPrice: 276.75, applyWithholdingTax: true })
    expect(t.totalActualAmount).toBe(688.0)
    expect(t.totalNamAmount).toBe(1383.75)
    expect(t.income).toBe(695.75)
    expect(t.incomePercent).toBe(50.28)
    expect(t.withholdingTax).toBe(13.84)
    expect(t.totalAmountDue).toBe(1369.91)
  })

  it('matches sale #3 (no withholding tax)', () => {
    const t = computeSaleLine({ quantity: 6, suppliersPrice: 250, namUnitPrice: 350 })
    expect(t.totalActualAmount).toBe(1500.0)
    expect(t.totalNamAmount).toBe(2100.0)
    expect(t.income).toBe(600.0)
    expect(t.incomePercent).toBe(28.57)
    expect(t.withholdingTax).toBe(0)
    expect(t.totalAmountDue).toBe(2100.0)
  })

  it('matches sale #2 rounding on WHT (22.276 → 22.27~22.28 band)', () => {
    const t = computeSaleLine({ quantity: 10, suppliersPrice: 175, namUnitPrice: 222.76, applyWithholdingTax: true })
    expect(t.totalNamAmount).toBe(2227.6)
    expect(t.income).toBe(477.6)
    expect(t.incomePercent).toBe(21.44)
    expect(t.totalAmountDue).toBe(round2(2227.6 - t.withholdingTax))
  })

  it('handles zero quantity and zero prices without NaN', () => {
    const t = computeSaleLine({ quantity: 0, suppliersPrice: 0, namUnitPrice: 0, applyWithholdingTax: true })
    expect(t.totalNamAmount).toBe(0)
    expect(t.incomePercent).toBe(0)
    expect(t.totalAmountDue).toBe(0)
  })
})

describe('computeQuotationTotal', () => {
  it('matches quotation #10: 100 × 202.50 = 20250', () => {
    expect(computeQuotationTotal(100, 202.5)).toBe(20250.0)
  })
})

describe('due dates', () => {
  it('parses numeric and verbose terms', () => {
    expect(parsePaymentTermDays('30')).toBe(30)
    expect(parsePaymentTermDays('30 days')).toBe(30)
    expect(parsePaymentTermDays('COD')).toBeNull()
    expect(parsePaymentTermDays('')).toBeNull()
    expect(parsePaymentTermDays(null)).toBeNull()
  })

  it('matches sale #1: delivered 2026-04-23 + 30 → 2026-05-23', () => {
    expect(computeDueDate('2026-04-23', '30')).toBe('2026-05-23')
  })

  it('no due date without delivery or with non-numeric term', () => {
    expect(computeDueDate(null, '30')).toBeNull()
    expect(computeDueDate('2026-04-23', 'COD')).toBeNull()
  })
})

describe('computeProductMargin', () => {
  it('matches product #10: 300 → 405 = 25.93%', () => {
    expect(computeProductMargin(300, 405)).toBe('25.93%')
  })
  it('matches product #25: 80 → 141.75 = 43.56%', () => {
    expect(computeProductMargin(80, 141.75)).toBe('43.56%')
  })
  it('zero NAM price → 0%', () => {
    expect(computeProductMargin(80, 0)).toBe('0%')
  })
})

describe('stockValue', () => {
  it('values stock on hand at the supplier price', () => {
    expect(stockValue(40, 120)).toBe(4800)
    expect(stockValue(3, 33.335)).toBe(100.01)
  })
  it('no price means unknown, not zero', () => {
    expect(stockValue(40, null)).toBeNull()
  })
  it('missing stock counts as none on hand', () => {
    expect(stockValue(null, 120)).toBe(0)
    expect(stockValue(0, 120)).toBe(0)
  })
  it('negative stock values negative — stock is allowed to go below zero', () => {
    expect(stockValue(-2, 120)).toBe(-240)
  })
})

describe('parseCurrency', () => {
  it('parses peso-formatted strings from legacy CSVs', () => {
    expect(parseCurrency('₱1,234.56')).toBe(1234.56)
    expect(parseCurrency('PHP 500')).toBe(500)
    expect(parseCurrency('1383.75')).toBe(1383.75)
    expect(parseCurrency('')).toBe(0)
    expect(parseCurrency(null)).toBe(0)
    expect(parseCurrency(42)).toBe(42)
  })
})

describe('isOverdue', () => {
  it('unpaid past-due is overdue; paid is not', () => {
    expect(isOverdue({ due_date: '2020-01-01', payment_status: 'Pending' })).toBe(true)
    expect(isOverdue({ due_date: '2020-01-01', payment_status: 'Paid' })).toBe(false)
    expect(isOverdue({ due_date: '2999-01-01', payment_status: 'Pending' })).toBe(false)
    expect(isOverdue({ due_date: null, payment_status: 'Pending' })).toBe(false)
  })
})
