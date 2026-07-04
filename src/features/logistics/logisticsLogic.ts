import type { SaleRow } from '@/types/database'

/**
 * Grouping for the driver Logistics view (legacy get_deliveries.php):
 * Company → PO cards showing every row of a (company, PO) group that still
 * has something undelivered — delivered rows stay visible as a delivery log.
 * Pure functions so the grouping and search rules are unit-testable.
 */

export const NO_PO_LABEL = 'No PO Number'
export const NO_COMPANY_LABEL = '(No Company)'

export type PoGroup = {
  /** Normalized PO number; '' for the "No PO Number" bucket. */
  po: string
  label: string
  /** Pending rows first (by id), then the delivered log (by id). */
  items: SaleRow[]
  deliveredCount: number
  totalCount: number
}

export type CompanyGroup = {
  company: string
  poGroups: PoGroup[]
  pendingCount: number
}

export function isPendingDelivery(s: Pick<SaleRow, 'date_delivered'>): boolean {
  return !s.date_delivered
}

/**
 * Builds Company → PO groups from the full sales dataset, keeping only
 * (company, PO) groups with at least one undelivered row. The search query
 * matches company, PO, or any item name; a matching group is shown whole so
 * its {done}/{total} progress stays truthful.
 */
export function buildDeliveryGroups(rows: SaleRow[], search = ''): CompanyGroup[] {
  const q = search.trim().toLowerCase()
  const byCompany = new Map<string, Map<string, SaleRow[]>>()
  for (const s of rows) {
    const company = s.company?.trim() || NO_COMPANY_LABEL
    const po = s.po_number?.trim() ?? ''
    const pos = byCompany.get(company) ?? new Map<string, SaleRow[]>()
    const items = pos.get(po) ?? []
    items.push(s)
    pos.set(po, items)
    byCompany.set(company, pos)
  }

  const companies: CompanyGroup[] = []
  for (const [company, pos] of byCompany) {
    const poGroups: PoGroup[] = []
    for (const [po, items] of pos) {
      if (!items.some(isPendingDelivery)) continue
      const label = po || NO_PO_LABEL
      const matches =
        !q ||
        company.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        items.some((i) => (i.item ?? '').toLowerCase().includes(q))
      if (!matches) continue
      const sorted = [...items].sort((a, b) => {
        const pendingFirst = Number(!isPendingDelivery(a)) - Number(!isPendingDelivery(b))
        return pendingFirst !== 0 ? pendingFirst : a.id - b.id
      })
      poGroups.push({
        po,
        label,
        items: sorted,
        deliveredCount: items.filter((i) => !isPendingDelivery(i)).length,
        totalCount: items.length,
      })
    }
    if (poGroups.length === 0) continue
    // Real POs alphabetically, the "No PO Number" bucket last.
    poGroups.sort((a, b) => {
      if (!a.po !== !b.po) return a.po ? -1 : 1
      return a.label.localeCompare(b.label)
    })
    companies.push({
      company,
      poGroups,
      pendingCount: poGroups.reduce((n, g) => n + (g.totalCount - g.deliveredCount), 0),
    })
  }
  companies.sort((a, b) => a.company.localeCompare(b.company))
  return companies
}

/** Flat list of the pending (deliverable) rows across the visible groups. */
export function pendingRows(groups: CompanyGroup[]): SaleRow[] {
  return groups.flatMap((c) => c.poGroups.flatMap((g) => g.items.filter(isPendingDelivery)))
}
