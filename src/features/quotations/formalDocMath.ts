import { round2 } from '@/lib/calculations'

/**
 * Totals footer of the Formal Quotation document.
 * Legacy math (quotations.php):
 *   inclusive → vatable = total / 1.12, vat = total − vatable, grand = total
 *   exclusive → vatable = total, vat = total × 0.12, grand = total + vat
 *   exempt    → vatable = total, vat = 0, grand = total
 *   WHT (optional) = 1% of vatable, subtracted from grand
 */
export type VatMode = 'inclusive' | 'exclusive' | 'exempt'

export type DocTotals = {
  itemsTotal: number
  vatableSales: number
  vat: number
  wht: number
  grandTotal: number
}

export const VAT_RATE = 0.12
export const DOC_WHT_RATE = 0.01

export function computeDocTotals(itemsTotal: number, vatMode: VatMode, lessWht: boolean): DocTotals {
  const total = round2(itemsTotal || 0)
  let vatableSales: number
  let vat: number
  let grandTotal: number
  if (vatMode === 'inclusive') {
    vatableSales = round2(total / (1 + VAT_RATE))
    vat = round2(total - vatableSales)
    grandTotal = total
  } else if (vatMode === 'exclusive') {
    vatableSales = total
    vat = round2(total * VAT_RATE)
    grandTotal = round2(total + vat)
  } else {
    vatableSales = total
    vat = 0
    grandTotal = total
  }
  const wht = lessWht ? round2(vatableSales * DOC_WHT_RATE) : 0
  grandTotal = round2(grandTotal - wht)
  return { itemsTotal: total, vatableSales, vat, wht, grandTotal }
}
