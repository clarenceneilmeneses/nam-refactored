import { parse as parseWithFormat, isValid, format } from 'date-fns'
import { computeDueDate, round2 } from '@/lib/calculations'
import type { ProductRow, SaleInsert } from '@/types/database'

export type ParsedCsv = {
  headers: string[]
  rows: Record<string, string>[]
  /** false = the file had no recognizable header row; columns were mapped by position. */
  hasHeaderRow: boolean
}

export type ImportField = { key: string; label: string; required: boolean }

/**
 * Order matters: it doubles as the positional fallback when the CSV has no
 * header row, matching the legacy "NAM SUPPLY-SALES ONLY ENCODER" column order.
 */
export const SALES_FIELDS: readonly ImportField[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'sn', label: 'S/N', required: false },
  { key: 'po_number', label: 'PO Number', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'item', label: 'Item', required: true },
  { key: 'quantity_requested', label: 'Qty', required: true },
  { key: 'suppliers_price', label: 'Supplier Price', required: false },
  { key: 'total_actual_amount', label: 'Total Actual', required: false },
  { key: 'nam_unit_price', label: 'NAM Unit Price', required: false },
  { key: 'total_nam_amount', label: 'Total NAM', required: false },
  { key: 'income', label: 'Income', required: false },
  { key: 'income_percent', label: 'Income %', required: false },
  { key: 'date_delivered', label: 'Date Delivered', required: false },
  { key: 'payment_term', label: 'Terms', required: false },
  { key: 'due_date', label: 'Due Date', required: false },
  { key: 'si_number', label: 'SI Number', required: false },
  { key: 'buyer', label: 'Buyer', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
  { key: 'supplier', label: 'Supplier', required: false },
  { key: 'withholding_tax', label: 'Withholding Tax', required: false },
] as const

/** "Centralized Suppliers' Price" sheet columns. */
export const PRICE_FIELDS: readonly ImportField[] = [
  { key: 'name', label: 'Product Name', required: true },
  { key: 'supplier', label: 'Supplier', required: false },
  { key: 'supplier_price', label: 'Supplier Price', required: true },
  { key: 'nam_price', label: 'NAM Price', required: false },
  { key: 'category_code', label: 'Category', required: false },
  { key: 'unit', label: 'Unit', required: false },
] as const

export type Mapping = Record<string, string> // field key -> csv header ('' = unmapped)

/** Header-name synonyms per field, matched against normalized header text. */
const CANDIDATES: Record<string, string[]> = {
  date: ['date', 'dateencoded'],
  sn: ['sn', 'serialnumber', 'serialno'],
  po_number: ['ponumber', 'po', 'pono'],
  company: ['company', 'client', 'customer'],
  category: ['category'],
  item: ['item', 'itemdescription', 'product', 'description'],
  quantity_requested: ['qty', 'quantity', 'quantityrequested'],
  suppliers_price: ['supplierprice', 'suppliersprice', 'supplierunitprice', 'cost'],
  total_actual_amount: ['totalactual', 'totalactualamount', 'actualamount'],
  nam_unit_price: ['namunitprice', 'namprice', 'unitprice', 'sellingprice'],
  total_nam_amount: ['totalnam', 'totalnamamount'],
  income: ['income', 'profit'],
  income_percent: ['income%', 'incomepercent', 'incomepct', 'profit%'],
  date_delivered: ['datedelivered', 'deliverydate', 'delivered'],
  payment_term: ['terms', 'term', 'paymentterm'],
  due_date: ['duedate'],
  si_number: ['sinumber', 'si', 'sino', 'salesinvoice'],
  buyer: ['buyer'],
  remarks: ['remarks', 'notes'],
  supplier: ['supplier', 'vendor'],
  // 'witholdingtax' (sic): the encoder sheet's header is misspelled.
  withholding_tax: ['withholdingtax', 'witholdingtax', 'wht'],
  name: ['productname', 'name', 'item', 'product', 'description', 'itemdescription'],
  supplier_price: ['supplierprice', 'suppliersprice', 'price', 'cost', 'unitcost'],
  nam_price: ['namprice', 'namunitprice', 'sellingprice', 'srp'],
  category_code: ['category', 'categorycode'],
  unit: ['unit', 'uom'],
}

// Keep % so "INCOME %" and "INCOME" normalize to different strings.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, '')

/**
 * Guess a column mapping from header names. Exact matches win over
 * "contains" matches, and a header is never assigned to two fields
 * (so "SUPPLIER PRICE" doesn't also claim the Supplier field).
 * With `positional`, unmatched fields fall back to their column position —
 * used when the file has no header row.
 */
export function guessMapping(headers: string[], fields: readonly ImportField[], positional = false): Mapping {
  const mapping: Mapping = {}
  const used = new Set<string>()
  for (const exact of [true, false]) {
    for (const field of fields) {
      if (mapping[field.key]) continue
      const wanted = CANDIDATES[field.key] ?? [norm(field.key)]
      const hit = headers.find(
        (h) => !used.has(h) && wanted.some((w) => (exact ? norm(h) === w : norm(h).includes(w))),
      )
      if (hit) {
        mapping[field.key] = hit
        used.add(hit)
      }
    }
  }
  if (positional) {
    fields.forEach((field, i) => {
      const h = headers[i]
      if (!mapping[field.key] && h && !used.has(h)) {
        mapping[field.key] = h
        used.add(h)
      }
    })
  }
  for (const field of fields) mapping[field.key] ??= ''
  return mapping
}

/**
 * Turn raw PapaParse output (header:false) into headers + keyed rows and an
 * initial mapping. Detects whether row 0 is a header row; when it isn't
 * (legacy exports sometimes lack one), synthesizes "Column N" headers and
 * maps by position.
 */
export function prepareCsv(
  data: string[][],
  fields: readonly ImportField[],
): { csv: ParsedCsv; mapping: Mapping } | null {
  const rows = data.filter((r) => r.some((c) => c && c.trim() !== ''))
  if (rows.length === 0) return null
  const width = Math.max(...rows.map((r) => r.length))
  const first = rows[0].map((c) => (c ?? '').trim())

  // Header row heuristic: several cells fuzzy-match known field names and
  // nothing in the row parses as a date (data rows always start with dates).
  const trial = guessMapping(first, fields)
  const fuzzyHits = Object.values(trial).filter(Boolean).length
  const hasHeaderRow = fuzzyHits >= 3 && !first.some((c) => parseFlexibleDate(c) !== null)

  const seen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, i) => {
    const base = (hasHeaderRow && first[i]) || `Column ${i + 1}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base} (${n + 1})`
  })

  const dataRows = (hasHeaderRow ? rows.slice(1) : rows).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])),
  )
  if (dataRows.length === 0) return null
  return {
    csv: { headers, rows: dataRows, hasHeaderRow },
    mapping: guessMapping(headers, fields, !hasHeaderRow),
  }
}

/**
 * Legacy currency scrub: strip everything except digits, dot, minus
 * ("₱1,234.56" → 1234.56). Blank/garbage cells → null so callers can
 * distinguish "not provided" from zero.
 */
export function scrubMoney(value: string): number | null {
  const cleaned = value.replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function toValidISO(y: number, m: number, d: number): string | null {
  if (!y || !m || !d) return null // rejects legacy 0000-00-00
  const dt = new Date(y, m - 1, d)
  const ok = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  return ok ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}

/**
 * Accepts YYYY-MM-DD and MM/DD/YYYY, regex-extracted from anywhere in the
 * cell (legacy "date paid" strings embed MM/DD/YYYY in free text).
 * Blank or unparseable → null.
 */
export function parseFlexibleDate(value: string): string | null {
  const s = value.trim()
  if (!s) return null
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return toValidISO(+iso[1], +iso[2], +iso[3])
  const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (us) {
    const year = us[3].length <= 2 ? 2000 + +us[3] : +us[3]
    return toValidISO(year, +us[1], +us[2])
  }
  for (const fmt of ['MMM d, yyyy', 'MMMM d, yyyy']) {
    const d = parseWithFormat(s, fmt, new Date())
    if (isValid(d)) return format(d, 'yyyy-MM-dd')
  }
  return null
}

export type RowIssue = { row: number; message: string }

export type SalesValidation = {
  valid: SaleInsert[]
  /** Rows that will be skipped, with reasons. */
  issues: RowIssue[]
  /** Rows that will still import but deserve a look. */
  warnings: RowIssue[]
  stats: { total: number; ready: number; skipped: number; missingCompany: number; badDates: number }
}

// income_percent is numeric(5,2) in Postgres.
const clampPercent = (n: number) => Math.max(-999.99, Math.min(999.99, n))

/**
 * Maps CSV rows to sales inserts. Money columns present in the CSV
 * (totals, income, income %) are passed through so re-imported legacy files
 * round-trip exactly; missing ones are recomputed from qty × unit prices.
 */
export function buildSalesRows(rows: Record<string, string>[], mapping: Mapping): SalesValidation {
  const valid: SaleInsert[] = []
  const issues: RowIssue[] = []
  const warnings: RowIssue[] = []
  let missingCompany = 0
  let badDates = 0
  const get = (row: Record<string, string>, key: string) => (mapping[key] ? (row[mapping[key]] ?? '').trim() : '')

  rows.forEach((row, i) => {
    const rowNo = i + 2 // header is line 1
    const rawDate = get(row, 'date')
    const date = parseFlexibleDate(rawDate)
    const item = get(row, 'item')
    const qty = scrubMoney(get(row, 'quantity_requested'))
    if (!date) {
      if (rawDate) badDates++
      return issues.push({ row: rowNo, message: rawDate ? `Unparseable date "${rawDate}"` : 'Missing date' })
    }
    if (!item) return issues.push({ row: rowNo, message: 'Missing item' })
    if (qty === null || qty <= 0)
      return issues.push({ row: rowNo, message: `Invalid quantity "${get(row, 'quantity_requested')}"` })

    const company = get(row, 'company')
    if (!company) {
      missingCompany++
      warnings.push({ row: rowNo, message: 'Missing company (row will import without one)' })
    }
    for (const key of ['date_delivered', 'due_date'] as const) {
      const raw = get(row, key)
      if (raw && parseFlexibleDate(raw) === null) {
        badDates++
        warnings.push({ row: rowNo, message: `Unparseable ${key.replace('_', ' ')} "${raw}" → blank` })
      }
    }

    const quantity = Math.round(qty)
    const suppliersPrice = scrubMoney(get(row, 'suppliers_price')) ?? 0
    const namUnitPrice = scrubMoney(get(row, 'nam_unit_price')) ?? 0
    const totalActual = scrubMoney(get(row, 'total_actual_amount')) ?? round2(quantity * suppliersPrice)
    const totalNam = scrubMoney(get(row, 'total_nam_amount')) ?? round2(quantity * namUnitPrice)
    const income = scrubMoney(get(row, 'income')) ?? round2(totalNam - totalActual)
    const incomePercent =
      scrubMoney(get(row, 'income_percent')) ?? (totalNam > 0 ? round2((income / totalNam) * 100) : 0)
    const wht = scrubMoney(get(row, 'withholding_tax')) ?? 0
    const dateDelivered = parseFlexibleDate(get(row, 'date_delivered'))
    const paymentTerm = get(row, 'payment_term') || null
    const dueDate = parseFlexibleDate(get(row, 'due_date')) ?? computeDueDate(dateDelivered, paymentTerm)

    valid.push({
      date,
      sn: get(row, 'sn') || null,
      po_number: get(row, 'po_number') || null,
      company: company || null,
      category: get(row, 'category') || null,
      item,
      quantity_requested: quantity,
      suppliers_price: suppliersPrice,
      nam_unit_price: namUnitPrice,
      total_actual_amount: totalActual,
      total_nam_amount: totalNam,
      income,
      income_percent: clampPercent(incomePercent),
      date_delivered: dateDelivered,
      payment_term: paymentTerm,
      due_date: dueDate,
      si_number: get(row, 'si_number') || null,
      buyer: get(row, 'buyer') || null,
      remarks: get(row, 'remarks') || null,
      supplier: get(row, 'supplier') || null,
      withholding_tax: wht,
      total_amount_due: round2(totalNam - wht),
      payment_status: 'Pending',
    })
  })
  return {
    valid,
    issues,
    warnings,
    stats: { total: rows.length, ready: valid.length, skipped: issues.length, missingCompany, badDates },
  }
}

export type PriceUpdate =
  | {
      kind: 'update'
      product: ProductRow
      supplier_price: number
      nam_price: number | null
      supplier: string | null
      category_code: string | null
    }
  | {
      kind: 'create'
      name: string
      supplier_price: number
      nam_price: number | null
      supplier: string | null
      category_code: string | null
      unit: string | null
    }

export function buildPriceUpdates(
  rows: Record<string, string>[],
  mapping: Mapping,
  products: ProductRow[],
): { updates: PriceUpdate[]; issues: RowIssue[] } {
  const updates: PriceUpdate[] = []
  const issues: RowIssue[] = []
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))
  const get = (row: Record<string, string>, key: string) => (mapping[key] ? (row[mapping[key]] ?? '').trim() : '')

  rows.forEach((row, i) => {
    const rowNo = i + 2
    const name = get(row, 'name')
    if (!name) return issues.push({ row: rowNo, message: 'Missing product name' })
    const price = scrubMoney(get(row, 'supplier_price'))
    if (price === null || price <= 0)
      return issues.push({ row: rowNo, message: `Invalid price "${get(row, 'supplier_price')}"` })
    const namRaw = get(row, 'nam_price')
    const nam = namRaw ? scrubMoney(namRaw) : null
    const supplier = get(row, 'supplier') || null
    const category = get(row, 'category_code') || null
    const existing = byName.get(name.toLowerCase())
    if (existing) {
      updates.push({
        kind: 'update',
        product: existing,
        supplier_price: price,
        nam_price: nam,
        supplier,
        category_code: category,
      })
    } else {
      updates.push({
        kind: 'create',
        name,
        supplier_price: price,
        nam_price: nam,
        supplier,
        category_code: category,
        unit: get(row, 'unit') || null,
      })
    }
  })
  return { updates, issues }
}
