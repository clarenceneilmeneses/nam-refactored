import { differenceInCalendarDays, parseISO } from 'date-fns'
import { round2 } from '@/lib/calculations'
import type { SaleRow } from '@/types/database'

/**
 * Row-status intelligence for the Sales Records page (legacy get_records.php).
 * Pure functions so the partial-delivery grouping, due tracker, and KPI math
 * are unit-testable without React.
 */

export type DeliveryStatus = 'Delivered' | 'Partial' | 'Pending'

/** Rows split by a partial delivery share the same (po_number, company, item). */
export function partialGroupKey(s: Pick<SaleRow, 'po_number' | 'company' | 'item'>): string {
  return `${s.po_number ?? ''}|${s.company ?? ''}|${s.item ?? ''}`
}

/**
 * Delivery status per row id, computed over the FULL dataset (not the filtered
 * view) so a pending row still counts as Partial when its delivered siblings
 * are filtered out. Partial = undelivered row whose group has ≥1 delivered row.
 */
export function deliveryStatuses(rows: SaleRow[]): Map<number, DeliveryStatus> {
  const deliveredPerGroup = new Map<string, number>()
  for (const r of rows) {
    if (r.date_delivered) {
      const key = partialGroupKey(r)
      deliveredPerGroup.set(key, (deliveredPerGroup.get(key) ?? 0) + 1)
    }
  }
  const out = new Map<number, DeliveryStatus>()
  for (const r of rows) {
    out.set(
      r.id,
      r.date_delivered
        ? 'Delivered'
        : (deliveredPerGroup.get(partialGroupKey(r)) ?? 0) > 0
          ? 'Partial'
          : 'Pending',
    )
  }
  return out
}

export type DueBadge =
  | { kind: 'paid' }
  | { kind: 'no-due-date' }
  | { kind: 'overdue'; days: number }
  | { kind: 'due-soon'; days: number }
  | { kind: 'due-later'; days: number }

/** Due Tracker: Paid beats everything; then no due date / overdue / ≤7 days / later. */
export function dueBadge(sale: Pick<SaleRow, 'due_date' | 'payment_status'>, todayISO: string): DueBadge {
  if (sale.payment_status === 'Paid') return { kind: 'paid' }
  if (!sale.due_date) return { kind: 'no-due-date' }
  const days = differenceInCalendarDays(parseISO(sale.due_date), parseISO(todayISO))
  if (days < 0) return { kind: 'overdue', days: -days }
  if (days <= 7) return { kind: 'due-soon', days }
  return { kind: 'due-later', days }
}

export type RecordKpis = {
  collected: number
  outstanding: number
  overdue: number
  pendingDelivery: number
}

/** KPI cards, computed live from the currently filtered rows. */
export function computeKpis(rows: SaleRow[], todayISO: string): RecordKpis {
  let collected = 0
  let outstanding = 0
  let overdue = 0
  let pendingDelivery = 0
  for (const r of rows) {
    const amount = r.total_nam_amount ?? 0
    if (r.payment_status === 'Paid') {
      collected += amount
    } else {
      outstanding += amount
      if (r.due_date && r.due_date < todayISO) overdue += amount
    }
    if (!r.date_delivered) pendingDelivery += 1
  }
  return {
    collected: round2(collected),
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    pendingDelivery,
  }
}

export type DeliveryFilter = '' | 'Pending' | 'Partial' | 'Delivered' | 'Reserved'
export type PaymentFilter = '' | 'Unpaid' | 'Paid'

export function matchesDelivery(
  sale: SaleRow,
  filter: DeliveryFilter,
  statuses: Map<number, DeliveryStatus>,
): boolean {
  switch (filter) {
    case 'Pending':
      return !sale.date_delivered
    case 'Partial':
      return statuses.get(sale.id) === 'Partial'
    case 'Delivered':
      return !!sale.date_delivered
    case 'Reserved':
      return !!sale.is_reserved
    default:
      return true
  }
}

export function matchesPayment(sale: SaleRow, filter: PaymentFilter): boolean {
  if (filter === 'Paid') return sale.payment_status === 'Paid'
  if (filter === 'Unpaid') return sale.payment_status !== 'Paid'
  return true
}

export type SiReviewFilter = '' | 'pending' | 'reviewed' | 'none'

/** SI # review state: pending = has an SI # awaiting the reviewer's approval. */
export function matchesSiReview(sale: SaleRow, filter: SiReviewFilter): boolean {
  switch (filter) {
    case 'pending':
      return !!sale.si_number && sale.si_reviewed !== true
    case 'reviewed':
      return sale.si_reviewed === true
    case 'none':
      return !sale.si_number
    default:
      return true
  }
}

/** Text search across item, PO, S/N, SI #, remarks, TIN, company, buyer, and supplier. */
export function matchesRecordSearch(sale: SaleRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    sale.item,
    sale.po_number,
    sale.sn,
    sale.si_number,
    sale.remarks,
    sale.tin,
    sale.company,
    sale.buyer,
    sale.supplier,
  ].some((field) => (field ?? '').toLowerCase().includes(q))
}
