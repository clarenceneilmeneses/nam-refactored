import type { SaleRow } from '@/types/database'

const COLUMNS: { key: keyof SaleRow; header: string }[] = [
  { key: 'id', header: 'ID' },
  { key: 'date', header: 'Date' },
  { key: 'sn', header: 'SN' },
  { key: 'po_number', header: 'PO Number' },
  { key: 'company', header: 'Company' },
  { key: 'category', header: 'Category' },
  { key: 'item', header: 'Item' },
  { key: 'quantity_requested', header: 'Qty' },
  { key: 'suppliers_price', header: 'Supplier Price' },
  { key: 'total_actual_amount', header: 'Total Actual' },
  { key: 'nam_unit_price', header: 'NAM Price' },
  { key: 'total_nam_amount', header: 'Total NAM' },
  { key: 'income', header: 'Income' },
  { key: 'income_percent', header: 'Income %' },
  { key: 'withholding_tax', header: 'WHT' },
  { key: 'total_amount_due', header: 'Amount Due' },
  { key: 'date_delivered', header: 'Date Delivered' },
  { key: 'payment_term', header: 'Payment Term' },
  { key: 'due_date', header: 'Due Date' },
  { key: 'payment_status', header: 'Payment Status' },
  { key: 'date_paid', header: 'Date Paid' },
  { key: 'si_number', header: 'SI Number' },
  { key: 'buyer', header: 'Buyer' },
  { key: 'supplier', header: 'Supplier' },
  { key: 'remarks', header: 'Remarks' },
]

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportSalesCsv(rows: SaleRow[], filename = 'sales-export.csv') {
  const header = COLUMNS.map((c) => c.header).join(',')
  const body = rows.map((row) => COLUMNS.map((c) => escapeCsv(row[c.key])).join(',')).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
