import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import {
  buildPriceUpdates,
  buildSalesRows,
  guessMapping,
  parseFlexibleDate,
  prepareCsv,
  scrubMoney,
  PRICE_FIELDS,
  SALES_FIELDS,
} from './importLogic'
import type { ProductRow } from '@/types/database'

describe('scrubMoney', () => {
  it('strips peso signs, commas, and spaces', () => {
    expect(scrubMoney('₱1,234.56')).toBe(1234.56)
    expect(scrubMoney('PHP 12,000')).toBe(12000)
    expect(scrubMoney('-₱500.25')).toBe(-500.25)
  })
  it('returns null for blank or garbage cells', () => {
    expect(scrubMoney('')).toBeNull()
    expect(scrubMoney('n/a')).toBeNull()
    expect(scrubMoney('TBD')).toBeNull()
  })
})

describe('parseFlexibleDate', () => {
  it('accepts YYYY-MM-DD and MM/DD/YYYY', () => {
    expect(parseFlexibleDate('2024-03-05')).toBe('2024-03-05')
    expect(parseFlexibleDate('3/5/2024')).toBe('2024-03-05')
    expect(parseFlexibleDate('12/31/24')).toBe('2024-12-31')
  })
  it('regex-extracts MM/DD/YYYY from messy legacy strings', () => {
    expect(parseFlexibleDate('PAID 3/15/2024 via check')).toBe('2024-03-15')
  })
  it('rejects blanks, zero dates, and impossible dates', () => {
    expect(parseFlexibleDate('')).toBeNull()
    expect(parseFlexibleDate('0000-00-00')).toBeNull()
    expect(parseFlexibleDate('13/45/2024')).toBeNull()
    expect(parseFlexibleDate('pending')).toBeNull()
  })
})

describe('guessMapping', () => {
  it('maps legacy encoder headers, keeping income and income % distinct', () => {
    const headers = ['DATE', 'S/N', 'PO', 'COMPANY', 'CATEGORY', 'ITEM', 'QTY', 'SUPPLIER PRICE', 'TOTAL ACTUAL', 'NAM UNIT PRICE', 'TOTAL NAM', 'INCOME', 'INCOME %', 'DATE DELIVERED', 'TERMS', 'DUE DATE', 'SI NUMBER', 'BUYER', 'REMARKS', 'SUPPLIER']
    const m = guessMapping(headers, SALES_FIELDS)
    expect(m.date).toBe('DATE')
    expect(m.income).toBe('INCOME')
    expect(m.income_percent).toBe('INCOME %')
    expect(m.suppliers_price).toBe('SUPPLIER PRICE')
    expect(m.supplier).toBe('SUPPLIER')
    expect(m.date_delivered).toBe('DATE DELIVERED')
    expect(m.due_date).toBe('DUE DATE')
    expect(m.payment_term).toBe('TERMS')
    expect(m.quantity_requested).toBe('QTY')
  })
  it('never assigns the same header to two fields', () => {
    const m = guessMapping(['SUPPLIER PRICE', 'PRICE'], PRICE_FIELDS)
    expect(m.supplier_price).toBe('SUPPLIER PRICE')
    expect(m.supplier).not.toBe('SUPPLIER PRICE')
  })
})

describe('prepareCsv', () => {
  it('detects a header row and keys rows by header', () => {
    const out = prepareCsv(
      [
        ['DATE', 'ITEM', 'QTY'],
        ['3/5/2024', 'Bond Paper', '10'],
      ],
      SALES_FIELDS,
    )
    expect(out).not.toBeNull()
    expect(out!.csv.hasHeaderRow).toBe(true)
    expect(out!.csv.rows).toHaveLength(1)
    expect(out!.csv.rows[0]['ITEM']).toBe('Bond Paper')
    expect(out!.mapping.item).toBe('ITEM')
  })
  it('falls back to positional mapping when there is no header row', () => {
    const out = prepareCsv(
      [
        ['3/5/2024', 'SN-1', 'PO-9', 'ACME CORP', 'OTHERS', 'Bond Paper', '10', '₱100.00'],
        ['3/6/2024', 'SN-2', 'PO-10', 'ACME CORP', 'OTHERS', 'Stapler', '2', '₱250.00'],
      ],
      SALES_FIELDS,
    )
    expect(out).not.toBeNull()
    expect(out!.csv.hasHeaderRow).toBe(false)
    expect(out!.csv.rows).toHaveLength(2)
    // Positional: field order matches the legacy encoder sheet columns.
    expect(out!.mapping.date).toBe('Column 1')
    expect(out!.mapping.item).toBe('Column 6')
    expect(out!.mapping.suppliers_price).toBe('Column 8')
  })
  it('dedupes repeated header names', () => {
    const out = prepareCsv(
      [
        ['DATE', 'ITEM', 'QTY', 'DATE'],
        ['3/5/2024', 'Bond Paper', '10', '3/9/2024'],
      ],
      SALES_FIELDS,
    )
    expect(out!.csv.headers).toEqual(['DATE', 'ITEM', 'QTY', 'DATE (2)'])
  })
  it('returns null for empty input', () => {
    expect(prepareCsv([], SALES_FIELDS)).toBeNull()
    expect(prepareCsv([['', '']], SALES_FIELDS)).toBeNull()
  })
})

const IDENTITY_MAPPING = Object.fromEntries(SALES_FIELDS.map((f) => [f.key, f.key]))

describe('buildSalesRows', () => {
  it('passes through CSV totals so legacy files round-trip exactly', () => {
    const { valid } = buildSalesRows(
      [
        {
          ...Object.fromEntries(SALES_FIELDS.map((f) => [f.key, ''])),
          date: '3/5/2024',
          item: 'Bond Paper',
          quantity_requested: '10',
          suppliers_price: '₱100.00',
          nam_unit_price: '₱120.00',
          // Deliberately inconsistent with qty × price: CSV values must win.
          total_actual_amount: '₱999.00',
          total_nam_amount: '₱1,500.00',
          income: '₱501.00',
          income_percent: '33.40%',
        },
      ],
      IDENTITY_MAPPING,
    )
    expect(valid).toHaveLength(1)
    expect(valid[0].total_actual_amount).toBe(999)
    expect(valid[0].total_nam_amount).toBe(1500)
    expect(valid[0].income).toBe(501)
    expect(valid[0].income_percent).toBe(33.4)
    expect(valid[0].total_amount_due).toBe(1500)
  })
  it('recomputes totals, income, and income % when the CSV lacks them', () => {
    const { valid } = buildSalesRows(
      [
        {
          ...Object.fromEntries(SALES_FIELDS.map((f) => [f.key, ''])),
          date: '2024-03-05',
          item: 'Bond Paper',
          quantity_requested: '10',
          suppliers_price: '₱100.00',
          nam_unit_price: '₱125.00',
        },
      ],
      IDENTITY_MAPPING,
    )
    expect(valid[0].total_actual_amount).toBe(1000)
    expect(valid[0].total_nam_amount).toBe(1250)
    expect(valid[0].income).toBe(250)
    expect(valid[0].income_percent).toBe(20)
  })
  it('computes due date from delivery + terms when the CSV has none', () => {
    const { valid } = buildSalesRows(
      [
        {
          ...Object.fromEntries(SALES_FIELDS.map((f) => [f.key, ''])),
          date: '2024-03-05',
          item: 'Bond Paper',
          quantity_requested: '1',
          date_delivered: '3/10/2024',
          payment_term: '30 days',
        },
      ],
      IDENTITY_MAPPING,
    )
    expect(valid[0].date_delivered).toBe('2024-03-10')
    expect(valid[0].due_date).toBe('2024-04-09')
  })
  it('skips rows with bad dates/items/quantities and warns on missing company', () => {
    const blank = Object.fromEntries(SALES_FIELDS.map((f) => [f.key, '']))
    const ok = { ...blank, date: '3/5/2024', item: 'Pen', quantity_requested: '5' }
    const { valid, issues, warnings, stats } = buildSalesRows(
      [
        ok,
        { ...ok, date: 'not a date' },
        { ...ok, item: '' },
        { ...ok, quantity_requested: '0' },
      ],
      IDENTITY_MAPPING,
    )
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(3)
    expect(stats.skipped).toBe(3)
    expect(stats.badDates).toBe(1)
    expect(stats.missingCompany).toBe(1) // the ok row has no company
    expect(warnings.some((w) => w.message.includes('Missing company'))).toBe(true)
  })
})

describe('legacy CSV round-trip (acceptance)', () => {
  it('re-importing a ₱/MM-DD-YYYY legacy export preserves the CSV sums', () => {
    const legacyCsv = [
      'DATE,S/N,PO,COMPANY,CATEGORY,ITEM,QTY,SUPPLIER PRICE,TOTAL ACTUAL,NAM UNIT PRICE,TOTAL NAM,INCOME,INCOME %,DATE DELIVERED,TERMS,DUE DATE,SI NUMBER,BUYER,REMARKS,SUPPLIER',
      '1/15/2024,1,PO-001,ACME CORP,OFFICE SUPPLIES,Bond Paper,10,"₱100.00","₱1,000.00","₱125.00","₱1,250.00","₱250.00",20.00%,1/20/2024,30,2/19/2024,SI-1,Ana,,Paper Co',
      '2/29/2024,2,PO-002,BETA INC,CONSUMABLES,Coffee,5,"₱200.00","₱1,000.00","₱260.00","₱1,300.00","₱300.00",23.08%,,COD,,,Ben,rush,Cafe Co',
    ].join('\n')
    const parsed = Papa.parse<string[]>(legacyCsv, { header: false, skipEmptyLines: 'greedy' })
    const prepared = prepareCsv(parsed.data, SALES_FIELDS)
    expect(prepared).not.toBeNull()
    expect(prepared!.csv.hasHeaderRow).toBe(true)
    const { valid, issues } = buildSalesRows(prepared!.csv.rows, prepared!.mapping)
    expect(issues).toHaveLength(0)
    expect(valid).toHaveLength(2)
    expect(valid[0].date).toBe('2024-01-15')
    expect(valid[1].date).toBe('2024-02-29')
    const sum = (key: 'total_actual_amount' | 'total_nam_amount' | 'income') =>
      valid.reduce((s, r) => s + (r[key] ?? 0), 0)
    expect(sum('total_actual_amount')).toBe(2000)
    expect(sum('total_nam_amount')).toBe(2550)
    expect(sum('income')).toBe(550)
  })
})

describe('buildPriceUpdates', () => {
  const product: ProductRow = {
    id: 1,
    name: 'Bond Paper',
    category_code: 'OFFICE SUPPLIES',
    unit: 'ream',
    supplier: 'Old Supplier',
    supplier_price: 90,
    nam_price: 120,
    margin: '25.00%',
    current_stock: 0,
    reorder_level: 0,
    is_draft: false,
    item_code: null,
  }
  const mapping = Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, f.key]))

  it('matches existing products by name (case-insensitive) and carries category', () => {
    const { updates } = buildPriceUpdates(
      [{ name: 'BOND PAPER', supplier: 'New Supplier', supplier_price: '₱95.00', nam_price: '', category_code: 'OTHERS', unit: '' }],
      mapping,
      [product],
    )
    expect(updates).toHaveLength(1)
    expect(updates[0].kind).toBe('update')
    if (updates[0].kind === 'update') {
      expect(updates[0].product.id).toBe(1)
      expect(updates[0].supplier_price).toBe(95)
      expect(updates[0].category_code).toBe('OTHERS')
    }
  })
  it('creates unknown names and skips rows without a valid price', () => {
    const { updates, issues } = buildPriceUpdates(
      [
        { name: 'New Widget', supplier: '', supplier_price: '₱10.00', nam_price: '₱15.00', category_code: '', unit: 'pc' },
        { name: 'Broken', supplier: '', supplier_price: 'free', nam_price: '', category_code: '', unit: '' },
      ],
      mapping,
      [product],
    )
    expect(updates).toHaveLength(1)
    expect(updates[0].kind).toBe('create')
    expect(issues).toHaveLength(1)
  })
})
