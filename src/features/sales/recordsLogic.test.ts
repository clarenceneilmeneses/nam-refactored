import { describe, expect, it } from 'vitest'
import {
  computeKpis,
  deliveryStatuses,
  dueBadge,
  matchesDelivery,
  matchesPayment,
  matchesRecordSearch,
  matchesSiReview,
} from './recordsLogic'
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
    si_reviewed: false,
    si_reviewed_by: null,
    si_reviewed_at: null,
    dr_number: null,
    buyer: null,
    remarks: null,
    supplier: null,
    address: null,
    tin: null,
    sales_invoice_no: null,
    contact_person_contact: null,
    created_at: '2026-07-01T00:00:00Z',
    is_reserved: false,
    withholding_tax: 0,
    total_amount_due: 0,
    ...overrides,
  }
}

const TODAY = '2026-07-04'

describe('deliveryStatuses', () => {
  it('flags undelivered rows as Partial only when their (po, company, item) group has delivered siblings', () => {
    const delivered = sale({ po_number: 'PO-1', company: 'ACME', item: 'Chair', date_delivered: '2026-07-01' })
    const pendingSibling = sale({ po_number: 'PO-1', company: 'ACME', item: 'Chair' })
    const otherItem = sale({ po_number: 'PO-1', company: 'ACME', item: 'Desk' })
    const otherPo = sale({ po_number: 'PO-2', company: 'ACME', item: 'Chair' })
    const statuses = deliveryStatuses([delivered, pendingSibling, otherItem, otherPo])
    expect(statuses.get(delivered.id)).toBe('Delivered')
    expect(statuses.get(pendingSibling.id)).toBe('Partial')
    expect(statuses.get(otherItem.id)).toBe('Pending')
    expect(statuses.get(otherPo.id)).toBe('Pending')
  })

  it('groups rows without a PO by company + item', () => {
    const delivered = sale({ company: 'ACME', item: 'Chair', date_delivered: '2026-07-01' })
    const pending = sale({ company: 'ACME', item: 'Chair' })
    const statuses = deliveryStatuses([delivered, pending])
    expect(statuses.get(pending.id)).toBe('Partial')
  })
})

describe('dueBadge', () => {
  it('Paid wins even when overdue', () => {
    expect(dueBadge(sale({ payment_status: 'Paid', due_date: '2026-01-01' }), TODAY)).toEqual({ kind: 'paid' })
  })
  it('no due date', () => {
    expect(dueBadge(sale({ due_date: null }), TODAY)).toEqual({ kind: 'no-due-date' })
  })
  it('overdue counts days past due', () => {
    expect(dueBadge(sale({ due_date: '2026-06-30' }), TODAY)).toEqual({ kind: 'overdue', days: 4 })
  })
  it('due today and within 7 days are due-soon', () => {
    expect(dueBadge(sale({ due_date: TODAY }), TODAY)).toEqual({ kind: 'due-soon', days: 0 })
    expect(dueBadge(sale({ due_date: '2026-07-11' }), TODAY)).toEqual({ kind: 'due-soon', days: 7 })
  })
  it('more than 7 days out is due-later', () => {
    expect(dueBadge(sale({ due_date: '2026-07-12' }), TODAY)).toEqual({ kind: 'due-later', days: 8 })
  })
})

describe('computeKpis', () => {
  it('splits collected / outstanding / overdue and counts pending deliveries', () => {
    const rows = [
      sale({ payment_status: 'Paid', total_nam_amount: 100, date_delivered: '2026-07-01' }),
      sale({ payment_status: 'Pending', total_nam_amount: 50 }), // undelivered → NOT outstanding (legacy rule)
      sale({ payment_status: 'Pending', total_nam_amount: 30, due_date: '2026-06-01', date_delivered: '2026-06-01' }), // overdue
      sale({ payment_status: 'Pending', total_nam_amount: 20, due_date: '2026-08-01', date_delivered: '2026-07-01' }),
    ]
    expect(computeKpis(rows, TODAY)).toEqual({
      collected: 100,
      outstanding: 50,
      overdue: 30,
      pendingDelivery: 1,
    })
  })

  it('unpaid rows are only outstanding once delivered', () => {
    const rows = [
      sale({ payment_status: 'Pending', total_nam_amount: 40 }),
      sale({ payment_status: 'Pending', total_nam_amount: 25, date_delivered: '2026-07-01' }),
    ]
    expect(computeKpis(rows, TODAY).outstanding).toBe(25)
  })

  it('a due date equal to today is not overdue', () => {
    const rows = [sale({ payment_status: 'Pending', total_nam_amount: 10, due_date: TODAY })]
    expect(computeKpis(rows, TODAY).overdue).toBe(0)
  })
})

describe('filters', () => {
  it('matchesDelivery handles all five options', () => {
    const delivered = sale({ po_number: 'PO-9', company: 'X', item: 'A', date_delivered: '2026-07-01' })
    const partial = sale({ po_number: 'PO-9', company: 'X', item: 'A' })
    const pending = sale({ po_number: 'PO-8', company: 'X', item: 'B', is_reserved: true })
    const statuses = deliveryStatuses([delivered, partial, pending])
    expect(matchesDelivery(delivered, '', statuses)).toBe(true)
    expect(matchesDelivery(delivered, 'Delivered', statuses)).toBe(true)
    expect(matchesDelivery(partial, 'Partial', statuses)).toBe(true)
    expect(matchesDelivery(delivered, 'Partial', statuses)).toBe(false)
    expect(matchesDelivery(partial, 'Pending', statuses)).toBe(true)
    expect(matchesDelivery(pending, 'Reserved', statuses)).toBe(true)
    expect(matchesDelivery(partial, 'Reserved', statuses)).toBe(false)
  })

  it('matchesPayment treats anything not Paid as Unpaid', () => {
    expect(matchesPayment(sale({ payment_status: 'Paid' }), 'Paid')).toBe(true)
    expect(matchesPayment(sale({ payment_status: 'Pending' }), 'Unpaid')).toBe(true)
    expect(matchesPayment(sale({ payment_status: null }), 'Unpaid')).toBe(true)
    expect(matchesPayment(sale({ payment_status: 'Paid' }), 'Unpaid')).toBe(false)
  })

  it('matchesSiReview splits pending / reviewed / no SI #', () => {
    const pending = sale({ si_number: 'SI-1', si_reviewed: false })
    const reviewed = sale({ si_number: 'SI-2', si_reviewed: true })
    const noSi = sale({ si_number: null })
    for (const row of [pending, reviewed, noSi]) {
      expect(matchesSiReview(row, '')).toBe(true)
    }
    expect(matchesSiReview(pending, 'pending')).toBe(true)
    expect(matchesSiReview(reviewed, 'pending')).toBe(false)
    expect(matchesSiReview(noSi, 'pending')).toBe(false) // nothing to review yet
    expect(matchesSiReview(reviewed, 'reviewed')).toBe(true)
    expect(matchesSiReview(pending, 'reviewed')).toBe(false)
    expect(matchesSiReview(noSi, 'none')).toBe(true)
    expect(matchesSiReview(pending, 'none')).toBe(false)
  })

  it('matchesRecordSearch scans item, PO, S/N, SI #, DR #, remarks, TIN, company, buyer, and supplier', () => {
    const row = sale({
      item: 'Bond Paper',
      po_number: 'PO-123',
      sn: 'SN-77',
      si_number: 'SI-9001',
      dr_number: 'DR-4402',
      remarks: 'rush order',
      tin: '007-123-456',
      company: 'ACME Corp',
      buyer: 'Jane Cruz',
      supplier: 'Widget Co',
    })
    for (const q of ['bond', 'po-123', 'sn-77', 'si-9001', 'dr-4402', 'rush', '007-123', 'acme', 'jane', 'widget']) {
      expect(matchesRecordSearch(row, q)).toBe(true)
    }
    expect(matchesRecordSearch(row, 'nowhere')).toBe(false)
    expect(matchesRecordSearch(row, '  ')).toBe(true)
  })
})
