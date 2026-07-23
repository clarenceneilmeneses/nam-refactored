import { addDays, parseISO } from 'date-fns'
import { toISODate } from './format'

/**
 * All money/percentage math for sales, quotations, and products.
 * Formulas verified against the legacy PHP app's stored data:
 *   total_actual_amount = quantity_requested × suppliers_price
 *   total_nam_amount    = quantity_requested × nam_unit_price
 *   income              = total_nam_amount − total_actual_amount
 *   income_percent      = income / total_nam_amount × 100
 *   withholding_tax     = 1% of total_nam_amount (only when applied)
 *   total_amount_due    = total_nam_amount − withholding_tax
 *   due_date            = date_delivered + payment_term (days)
 *   product margin      = (nam_price − supplier_price) / nam_price × 100
 */

export const WITHHOLDING_TAX_RATE = 0.01

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type SaleLineInput = {
  quantity: number
  suppliersPrice: number
  namUnitPrice: number
  applyWithholdingTax?: boolean
}

export type SaleLineTotals = {
  totalActualAmount: number
  totalNamAmount: number
  income: number
  incomePercent: number
  withholdingTax: number
  totalAmountDue: number
}

export function computeSaleLine(input: SaleLineInput): SaleLineTotals {
  const qty = input.quantity || 0
  const totalActualAmount = round2(qty * (input.suppliersPrice || 0))
  const totalNamAmount = round2(qty * (input.namUnitPrice || 0))
  const income = round2(totalNamAmount - totalActualAmount)
  const incomePercent = totalNamAmount > 0 ? round2((income / totalNamAmount) * 100) : 0
  const withholdingTax = input.applyWithholdingTax ? round2(totalNamAmount * WITHHOLDING_TAX_RATE) : 0
  const totalAmountDue = round2(totalNamAmount - withholdingTax)
  return { totalActualAmount, totalNamAmount, income, incomePercent, withholdingTax, totalAmountDue }
}

export function computeQuotationTotal(quantity: number, namUnitPrice: number): number {
  return round2((quantity || 0) * (namUnitPrice || 0))
}

/** payment_term is stored as free text like "30", "30 days", "COD". Non-numeric terms yield no due date. */
export function parsePaymentTermDays(term: string | null | undefined): number | null {
  if (!term) return null
  const match = term.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

/** due_date = date_delivered + payment_term days; null when either side is missing/non-numeric. */
export function computeDueDate(
  dateDelivered: string | null | undefined,
  paymentTerm: string | null | undefined,
): string | null {
  if (!dateDelivered) return null
  const days = parsePaymentTermDays(paymentTerm)
  if (days === null) return null
  return toISODate(addDays(parseISO(dateDelivered), days))
}

/** Margin relative to NAM price, formatted like the legacy app stores it ("25.93%"). */
export function computeProductMargin(supplierPrice: number, namPrice: number): string {
  if (!namPrice || namPrice <= 0) return '0%'
  return `${round2(((namPrice - supplierPrice) / namPrice) * 100).toFixed(2)}%`
}

/**
 * Value of the stock on hand at a given unit price. Derived on the fly rather
 * than stored: a products column would come back empty after every Legacy
 * Restore, which reloads only the columns the legacy dump carries.
 * A null price means "unknown", not zero.
 */
export function stockValue(stock: number | null, unitPrice: number | null): number | null {
  if (unitPrice === null) return null
  return round2((stock ?? 0) * unitPrice)
}

/* Bidirectional markup/margin solvers (quotation price calculator):
 *   markup% = (n − s) / s × 100   margin% = (n − s) / n × 100
 */
export function markupPercent(supplierPrice: number, namPrice: number): number {
  if (!supplierPrice || supplierPrice <= 0) return 0
  return round2(((namPrice - supplierPrice) / supplierPrice) * 100)
}

export function marginPercent(supplierPrice: number, namPrice: number): number {
  if (!namPrice || namPrice <= 0) return 0
  return round2(((namPrice - supplierPrice) / namPrice) * 100)
}

/** Selling price that yields the given markup% over the supplier price. */
export function priceFromMarkup(supplierPrice: number, markup: number): number {
  return round2((supplierPrice || 0) * (1 + (markup || 0) / 100))
}

/** Selling price that yields the given margin% of the selling price. Margin ≥ 100% is unsolvable → 0. */
export function priceFromMargin(supplierPrice: number, margin: number): number {
  if ((margin || 0) >= 100) return 0
  return round2((supplierPrice || 0) / (1 - (margin || 0) / 100))
}

/** Parses legacy CSV currency strings: "₱1,234.56", "1,234.56", "PHP 1234.56". */
export function parseCurrency(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const cleaned = value.replace(/[₱,\s]/g, '').replace(/PHP/gi, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function isOverdue(sale: { due_date: string | null; payment_status: string | null }): boolean {
  if (!sale.due_date || sale.payment_status === 'Paid') return false
  return sale.due_date < toISODate(new Date())
}
