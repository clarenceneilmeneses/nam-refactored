import { describe, expect, it } from 'vitest'
import { computeDocTotals } from './formalDocMath'
import { nextQuoteRef } from './quoteRef'
import { itemImageKey } from './quoteImages'
import { marginPercent, markupPercent, priceFromMargin, priceFromMarkup } from '@/lib/calculations'

describe('computeDocTotals', () => {
  it('VAT inclusive: 1,120 → vatable 1,000 / VAT 120 / grand 1,120', () => {
    const t = computeDocTotals(1120, 'inclusive', false)
    expect(t.vatableSales).toBe(1000)
    expect(t.vat).toBe(120)
    expect(t.wht).toBe(0)
    expect(t.grandTotal).toBe(1120)
  })

  it('VAT inclusive + 1% WHT: WHT 10 off the grand total → 1,110', () => {
    const t = computeDocTotals(1120, 'inclusive', true)
    expect(t.vatableSales).toBe(1000)
    expect(t.vat).toBe(120)
    expect(t.wht).toBe(10)
    expect(t.grandTotal).toBe(1110)
  })

  it('VAT exclusive adds 12% on top', () => {
    const t = computeDocTotals(1000, 'exclusive', false)
    expect(t.vatableSales).toBe(1000)
    expect(t.vat).toBe(120)
    expect(t.grandTotal).toBe(1120)
  })

  it('VAT exempt has no VAT', () => {
    const t = computeDocTotals(1000, 'exempt', false)
    expect(t.vat).toBe(0)
    expect(t.grandTotal).toBe(1000)
  })

  it('rounds to 2 decimals', () => {
    const t = computeDocTotals(999.99, 'inclusive', true)
    expect(t.vatableSales).toBe(892.85)
    expect(t.vat).toBe(107.14)
    expect(t.wht).toBe(8.93)
    expect(t.grandTotal).toBe(991.06)
  })
})

describe('nextQuoteRef', () => {
  const now = new Date(2026, 5, 15)

  it('starts at NNN 001 when the year has no refs', () => {
    expect(nextQuoteRef(['2025-118', 'QTE-20260226-6195', null], now)).toBe('2026-001')
  })

  it('increments the highest ref of the current year, zero-padded', () => {
    expect(nextQuoteRef(['2026-046', '2026-047', '2026-002'], now)).toBe('2026-048')
  })

  it('goes past 999 without truncating', () => {
    expect(nextQuoteRef(['2026-999'], now)).toBe('2026-1000')
  })
})

describe('markup/margin solvers', () => {
  it('markup and margin from prices', () => {
    expect(markupPercent(100, 125)).toBe(25)
    expect(marginPercent(100, 125)).toBe(20)
  })

  it('price from markup and from margin are inverses', () => {
    expect(priceFromMarkup(100, 25)).toBe(125)
    expect(priceFromMargin(100, 20)).toBe(125)
  })

  it('guards division by zero / impossible margin', () => {
    expect(markupPercent(0, 125)).toBe(0)
    expect(marginPercent(100, 0)).toBe(0)
    expect(priceFromMargin(100, 100)).toBe(0)
  })
})

describe('itemImageKey', () => {
  it('sanitises the item name like legacy cache_img_ keys', () => {
    expect(itemImageKey('Safety Shoes (Size 9) / Black')).toBe('cache_img_Safety_Shoes_Size_9_Black')
  })
})
