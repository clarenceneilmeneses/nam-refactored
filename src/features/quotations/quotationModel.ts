import type { QuotationRow } from '@/types/database'

/** Pending items older than this read as dormant rather than urgent. */
export const STALE_DAYS = 90

export function statusOf(q: QuotationRow): string {
  return q.status ?? 'Pending'
}

export type RefGroup = {
  quoteRef: string
  company: string | null
  /** Newest item date in the ref (rows arrive date desc, so the first seen). */
  date: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  items: QuotationRow[]
  /** Non-Converted items — unchanged "action" semantics used by the filter. */
  actionCount: number
  /** Sum of total_amount across non-Converted items. */
  openValue: number
  /** Non-Converted items older than STALE_DAYS. */
  staleCount: number
}

export type CompanyGroup = {
  company: string
  refs: RefGroup[]
  actionCount: number
  itemCount: number
  refCount: number
  latestDate: string
  openValue: number
  /** Non-Converted items younger than STALE_DAYS — drives the amber badge. */
  freshActionCount: number
  /** Non-Converted items older than STALE_DAYS — drives the dormant chip. */
  staleActionCount: number
}

export type Segment = 'all' | 'action' | 'converted'
export type SortMode = 'recent' | 'name' | 'value'

/** Whole-number days from `iso` (date-only) until now. */
export function daysBetween(iso: string, now: Date = new Date()): number {
  const then = new Date(`${iso}T00:00:00`).getTime()
  if (Number.isNaN(then)) return 0
  return Math.floor((now.getTime() - then) / 86_400_000)
}

/** Compact relative age for a ref, e.g. "today", "5d ago", "3 mo ago". */
export function relativeAge(iso: string): string {
  const days = daysBetween(iso)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 45) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 18) return `${months} mo ago`
  return `${Math.round(days / 365)}y ago`
}

/** Short magnitude for the stale chip, e.g. "3 mo", "1y". */
export function staleLabel(iso: string): string {
  const days = daysBetween(iso)
  const months = Math.max(1, Math.round(days / 30))
  return months < 18 ? `${months} mo` : `${Math.round(days / 365)}y`
}

/**
 * Company → quote_ref grouping with age/value rollups. Preserves incoming row
 * order (date desc, id desc), so refs come newest first within each company.
 */
export function buildCompanyGroups(quotations: QuotationRow[] | undefined): CompanyGroup[] {
  const now = new Date()
  const companies = new Map<string, Map<string, RefGroup>>()

  for (const q of quotations ?? []) {
    const companyKey = q.company?.trim() || '(No company)'
    const refKey = q.quote_ref?.trim() || `(no ref) #${q.id}`
    let refs = companies.get(companyKey)
    if (!refs) {
      refs = new Map()
      companies.set(companyKey, refs)
    }
    let group = refs.get(refKey)
    if (!group) {
      group = {
        quoteRef: refKey,
        company: q.company,
        date: q.date,
        poNumber: q.po_number,
        paymentTerm: q.payment_term,
        remarks: q.remarks,
        items: [],
        actionCount: 0,
        openValue: 0,
        staleCount: 0,
      }
      refs.set(refKey, group)
    }
    group.items.push(q)
    if (statusOf(q) !== 'Converted') {
      group.actionCount += 1
      group.openValue += q.total_amount ?? 0
      if (daysBetween(q.date, now) >= STALE_DAYS) group.staleCount += 1
    }
  }

  return [...companies.entries()].map(([company, refs]) => rollupCompany(company, [...refs.values()]))
}

/** Rolls a ref subset up into a CompanyGroup — reused for filtered views. */
export function rollupCompany(company: string, refs: RefGroup[]): CompanyGroup {
  let latestDate = ''
  let staleActionCount = 0
  for (const r of refs) {
    if (r.date > latestDate) latestDate = r.date
    staleActionCount += r.staleCount
  }
  const actionCount = refs.reduce((n, r) => n + r.actionCount, 0)
  return {
    company,
    refs,
    actionCount,
    itemCount: refs.reduce((n, r) => n + r.items.length, 0),
    refCount: refs.length,
    latestDate,
    openValue: refs.reduce((n, r) => n + r.openValue, 0),
    freshActionCount: actionCount - staleActionCount,
    staleActionCount,
  }
}

/** Callbacks threaded from the page into the detail pane and ref cards. */
export type QuotationActions = {
  onAddItem: (ref: RefGroup) => void
  onEditGroup: (ref: RefGroup) => void
  onPrintGroup: (ref: RefGroup) => void
  onDeleteGroup: (ref: RefGroup) => void
  onBuyAgain: (q: QuotationRow) => void
  onEditItem: (q: QuotationRow) => void
  onToggleReserve: (q: QuotationRow) => void
  onApprove: (q: QuotationRow) => void
  onFinalize: (q: QuotationRow) => void
  onRemove: (q: QuotationRow) => void
  reserveBusy: boolean
  /** false on touch devices → per-item actions stay always visible. */
  revealOnHover: boolean
}
