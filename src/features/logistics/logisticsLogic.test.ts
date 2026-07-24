import { describe, expect, it } from 'vitest'
import { buildDeliveryGroups, pendingRows, NO_PO_LABEL, NO_COMPANY_LABEL } from './logisticsLogic'
import type { SaleRow } from '@/types/database'

let nextId = 1

function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    id: nextId++,
    date: '2026-07-01',
    sn: null,
    po_number: null,
    company: null,
    category: null,
    item: null,
    quantity_requested: 1,
    suppliers_price: 0,
    total_actual_amount: 0,
    nam_unit_price: 0,
    total_nam_amount: 0,
    total_nam_amount_sub_total: null,
    income: 0,
    income_percent: 0,
    date_delivered: null,
    payment_term: null,
    due_date: null,
    payment_status: 'Pending',
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
    created_at: '2026-07-01T00:00:00Z',
    is_reserved: false,
    withholding_tax: 0,
    total_amount_due: 0,
    ...overrides,
  }
}

describe('buildDeliveryGroups', () => {
  it('keeps delivered rows visible when their (company, PO) group still has pending items', () => {
    const delivered = sale({ company: 'ACME', po_number: 'PO-1', item: 'Chair', date_delivered: '2026-07-01' })
    const pending = sale({ company: 'ACME', po_number: 'PO-1', item: 'Desk' })
    const groups = buildDeliveryGroups([delivered, pending])
    expect(groups).toHaveLength(1)
    const g = groups[0].poGroups[0]
    expect(g.items.map((i) => i.id)).toEqual([pending.id, delivered.id]) // pending first, delivered log after
    expect(g.deliveredCount).toBe(1)
    expect(g.totalCount).toBe(2)
  })

  it('drops fully delivered (company, PO) groups', () => {
    const rows = [
      sale({ company: 'ACME', po_number: 'PO-1', date_delivered: '2026-07-01' }),
      sale({ company: 'ACME', po_number: 'PO-2' }),
    ]
    const groups = buildDeliveryGroups(rows)
    expect(groups[0].poGroups.map((g) => g.label)).toEqual(['PO-2'])
  })

  it('buckets empty POs under "No PO Number", sorted after real POs', () => {
    const rows = [
      sale({ company: 'ACME', po_number: null }),
      sale({ company: 'ACME', po_number: '  ' }),
      sale({ company: 'ACME', po_number: 'PO-9' }),
    ]
    const groups = buildDeliveryGroups(rows)
    expect(groups[0].poGroups.map((g) => g.label)).toEqual(['PO-9', NO_PO_LABEL])
    expect(groups[0].poGroups[1].totalCount).toBe(2)
  })

  it('groups blank companies under the no-company label and sorts companies alphabetically', () => {
    const rows = [sale({ company: 'Zeta' }), sale({ company: null }), sale({ company: 'Acme' })]
    const groups = buildDeliveryGroups(rows)
    expect(groups.map((g) => g.company)).toEqual([NO_COMPANY_LABEL, 'Acme', 'Zeta'])
  })

  it('search matches company, PO, or item and keeps the whole matching group', () => {
    const rows = [
      sale({ company: 'ACME', po_number: 'PO-1', item: 'Chair' }),
      sale({ company: 'ACME', po_number: 'PO-1', item: 'Desk' }),
      sale({ company: 'Beta', po_number: 'PO-2', item: 'Lamp' }),
    ]
    expect(buildDeliveryGroups(rows, 'chair')[0].poGroups[0].items).toHaveLength(2)
    expect(buildDeliveryGroups(rows, 'po-2').map((g) => g.company)).toEqual(['Beta'])
    expect(buildDeliveryGroups(rows, 'beta').map((g) => g.company)).toEqual(['Beta'])
    expect(buildDeliveryGroups(rows, 'nothing')).toHaveLength(0)
  })

  it('counts pending per company across PO groups', () => {
    const rows = [
      sale({ company: 'ACME', po_number: 'PO-1' }),
      sale({ company: 'ACME', po_number: 'PO-1', date_delivered: '2026-07-01' }),
      sale({ company: 'ACME', po_number: 'PO-2' }),
    ]
    const groups = buildDeliveryGroups(rows)
    expect(groups[0].pendingCount).toBe(2)
    expect(pendingRows(groups)).toHaveLength(2)
  })
})
