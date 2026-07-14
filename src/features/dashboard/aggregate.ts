import { round2 } from '@/lib/calculations'
import type { CompanyAssignmentRow, SaleRow } from '@/types/database'
import { bucketOf, inDateRange, type Drills, type GroupBy } from './filters'
import { UNASSIGNED } from './palette'

export const UNCATEGORIZED = 'Uncategorized'

export function companyKey(row: SaleRow): string {
  return row.company?.trim() || '(No Company)'
}

export function categoryKey(row: SaleRow): string {
  return row.category?.trim() || UNCATEGORIZED
}

/** Normalized company name → account manager (employee_name). */
export type ManagerLookup = Map<string, string>

export function buildManagerLookup(assignments: CompanyAssignmentRow[]): ManagerLookup {
  const lookup: ManagerLookup = new Map()
  for (const a of assignments) {
    if (!a.company_name) continue
    lookup.set(a.company_name.trim().toLowerCase(), a.employee_name?.trim() || UNASSIGNED)
  }
  return lookup
}

export function managerOf(lookup: ManagerLookup, company: string | null): string {
  if (!company) return UNASSIGNED
  return lookup.get(company.trim().toLowerCase()) ?? UNASSIGNED
}

/** Date range + all active drills combined — every chart, KPI, and the matrix use this. */
export function filterRows(
  rows: SaleRow[],
  range: { start: string; end: string },
  drills: Drills,
  lookup: ManagerLookup,
): SaleRow[] {
  return rows.filter((row) => {
    if (!inDateRange(row.date, range)) return false
    if (drills.company !== null && companyKey(row) !== drills.company) return false
    if (drills.category !== null && categoryKey(row) !== drills.category) return false
    if (drills.manager !== null && managerOf(lookup, row.company) !== drills.manager) return false
    return true
  })
}

export type Totals = {
  revenue: number
  profit: number
  margin: number
  orders: number
  avgOrder: number
  collected: number
  unpaid: number
}

export function totals(rows: SaleRow[]): Totals {
  let revenue = 0
  let profit = 0
  let collected = 0
  for (const r of rows) {
    revenue += r.total_nam_amount ?? 0
    profit += r.income ?? 0
    if (r.payment_status === 'Paid') collected += r.total_nam_amount ?? 0
  }
  revenue = round2(revenue)
  profit = round2(profit)
  collected = round2(collected)
  const orders = rows.length
  return {
    revenue,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    orders,
    avgOrder: orders > 0 ? round2(revenue / orders) : 0,
    collected,
    unpaid: round2(revenue - collected),
  }
}

export type TimelinePoint = { key: string; label: string; revenue: number; profit: number; margin: number }

/** Buckets present in the data, chronological (legacy GROUP BY — no gap filling). */
export function timelineSeries(rows: SaleRow[], groupBy: GroupBy): TimelinePoint[] {
  const byKey = new Map<string, TimelinePoint & { profit: number }>()
  for (const r of rows) {
    const { key, label } = bucketOf(r.date, groupBy)
    const point = byKey.get(key) ?? { key, label, revenue: 0, margin: 0, profit: 0 }
    point.revenue += r.total_nam_amount ?? 0
    point.profit += r.income ?? 0
    byKey.set(key, point)
  }
  return [...byKey.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, label, revenue, profit }) => ({
      key,
      label,
      revenue: round2(revenue),
      profit: round2(profit),
      margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    }))
}

/** "Delivered" = date_delivered IS NOT NULL (legacy '0000-00-00' became NULL). */
export function logisticsSplit(rows: SaleRow[]): { delivered: number; pending: number } {
  const delivered = rows.filter((r) => r.date_delivered !== null).length
  return { delivered, pending: rows.length - delivered }
}

export type CompanyPerf = { company: string; total: number; manager: string }

export function companyPerformance(rows: SaleRow[], lookup: ManagerLookup): CompanyPerf[] {
  const byCompany = new Map<string, CompanyPerf>()
  for (const r of rows) {
    const key = companyKey(r)
    const entry = byCompany.get(key) ?? { company: key, total: 0, manager: managerOf(lookup, r.company) }
    entry.total += r.total_nam_amount ?? 0
    byCompany.set(key, entry)
  }
  return [...byCompany.values()]
    .map((c) => ({ ...c, total: round2(c.total) }))
    .sort((a, b) => b.total - a.total)
}

export type ManagerPerf = { manager: string; total: number; companies: number }

export function managerPerformance(rows: SaleRow[], lookup: ManagerLookup): ManagerPerf[] {
  const byManager = new Map<string, { total: number; companies: Set<string> }>()
  for (const r of rows) {
    const key = managerOf(lookup, r.company)
    const entry = byManager.get(key) ?? { total: 0, companies: new Set<string>() }
    entry.total += r.total_nam_amount ?? 0
    entry.companies.add(companyKey(r))
    byManager.set(key, entry)
  }
  return [...byManager.entries()]
    .map(([manager, e]) => ({ manager, total: round2(e.total), companies: e.companies.size }))
    .sort((a, b) => b.total - a.total)
}

export type CategoryPerf = { category: string; total: number }

export function categoryPerformance(rows: SaleRow[]): CategoryPerf[] {
  const byCategory = new Map<string, number>()
  for (const r of rows) {
    const key = categoryKey(r)
    byCategory.set(key, (byCategory.get(key) ?? 0) + (r.total_nam_amount ?? 0))
  }
  return [...byCategory.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
}

/** Revenue split by payment status: Paid vs everything else. */
export function collectionSplit(rows: SaleRow[]): { paid: number; unpaid: number } {
  let paid = 0
  let unpaid = 0
  for (const r of rows) {
    if (r.payment_status === 'Paid') paid += r.total_nam_amount ?? 0
    else unpaid += r.total_nam_amount ?? 0
  }
  return { paid: round2(paid), unpaid: round2(unpaid) }
}

export type NamedTotal = { name: string; total: number }

export function topProducts(rows: SaleRow[], limit = 10): NamedTotal[] {
  const byItem = new Map<string, number>()
  for (const r of rows) {
    const key = r.item?.trim()
    if (!key) continue
    byItem.set(key, (byItem.get(key) ?? 0) + (r.total_nam_amount ?? 0))
  }
  return [...byItem.entries()]
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export function supplierCosts(rows: SaleRow[], limit = 5): NamedTotal[] {
  const bySupplier = new Map<string, number>()
  for (const r of rows) {
    const key = r.supplier?.trim()
    if (!key) continue
    bySupplier.set(key, (bySupplier.get(key) ?? 0) + (r.total_actual_amount ?? 0))
  }
  return [...bySupplier.entries()]
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export type MatrixItem = { item: string; qty: number; revenue: number; profit: number }
export type MatrixCategory = { category: string; qty: number; revenue: number; profit: number; items: MatrixItem[] }

export function salesMatrix(rows: SaleRow[]): MatrixCategory[] {
  const byCategory = new Map<string, { qty: number; revenue: number; profit: number; items: Map<string, MatrixItem> }>()
  for (const r of rows) {
    const catKey = categoryKey(r)
    const cat = byCategory.get(catKey) ?? { qty: 0, revenue: 0, profit: 0, items: new Map<string, MatrixItem>() }
    const qty = r.quantity_requested ?? 0
    const revenue = r.total_nam_amount ?? 0
    const profit = r.income ?? 0
    cat.qty += qty
    cat.revenue += revenue
    cat.profit += profit
    const itemKey = r.item?.trim() || '(No Item)'
    const item = cat.items.get(itemKey) ?? { item: itemKey, qty: 0, revenue: 0, profit: 0 }
    item.qty += qty
    item.revenue += revenue
    item.profit += profit
    cat.items.set(itemKey, item)
    byCategory.set(catKey, cat)
  }
  return [...byCategory.entries()]
    .map(([category, c]) => ({
      category,
      qty: c.qty,
      revenue: round2(c.revenue),
      profit: round2(c.profit),
      items: [...c.items.values()]
        .map((i) => ({ ...i, revenue: round2(i.revenue), profit: round2(i.profit) }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
}
