import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPeso } from '@/lib/format'
import { marginPercent, markupPercent, priceFromMargin, priceFromMarkup, round2 } from '@/lib/calculations'

export type CalcValues = { supplier: number; price: number }

type PriceCalculatorProps = {
  initialSupplier?: number
  initialPrice?: number
  /** When set, shows the live Item Total (= quantity × selling price). */
  quantity?: number
  /** Field labels; products calls these "Supplier Price" / "Selling Price". */
  supplierLabel?: string
  priceLabel?: string
  onChange: (values: CalcValues) => void
}

function num(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function str(n: number): string {
  return n ? String(round2(n)) : ''
}

/**
 * Four-way bidirectional price solver (legacy quotations.php calculator):
 * editing cost or selling price re-derives markup/margin; editing markup or
 * margin re-derives the selling price. Remount (key) to reseed from a product.
 */
export function PriceCalculator({
  initialSupplier = 0,
  initialPrice = 0,
  quantity,
  supplierLabel = 'Supplier Cost',
  priceLabel = 'Selling Price',
  onChange,
}: PriceCalculatorProps) {
  const [supplierStr, setSupplierStr] = useState(str(initialSupplier))
  const [priceStr, setPriceStr] = useState(str(initialPrice))
  const [markupStr, setMarkupStr] = useState(str(markupPercent(initialSupplier, initialPrice)))
  const [marginStr, setMarginStr] = useState(str(marginPercent(initialSupplier, initialPrice)))

  function report(supplier: number, price: number) {
    onChange({ supplier: round2(supplier), price: round2(price) })
  }

  function changeSupplier(v: string) {
    setSupplierStr(v)
    const s = num(v)
    const p = num(priceStr)
    setMarkupStr(str(markupPercent(s, p)))
    setMarginStr(str(marginPercent(s, p)))
    report(s, p)
  }

  function changePrice(v: string) {
    setPriceStr(v)
    const s = num(supplierStr)
    const p = num(v)
    setMarkupStr(str(markupPercent(s, p)))
    setMarginStr(str(marginPercent(s, p)))
    report(s, p)
  }

  function changeMarkup(v: string) {
    setMarkupStr(v)
    const s = num(supplierStr)
    const p = priceFromMarkup(s, num(v))
    setPriceStr(str(p))
    setMarginStr(str(marginPercent(s, p)))
    report(s, p)
  }

  function changeMargin(v: string) {
    setMarginStr(v)
    const s = num(supplierStr)
    const p = priceFromMargin(s, num(v))
    setPriceStr(str(p))
    setMarkupStr(str(markupPercent(s, p)))
    report(s, p)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>{supplierLabel}</Label>
          <Input type="number" step="0.01" min={0} value={supplierStr} onChange={(e) => changeSupplier(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{priceLabel}</Label>
          <Input type="number" step="0.01" min={0} value={priceStr} onChange={(e) => changePrice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Markup %</Label>
          <Input type="number" step="0.01" value={markupStr} onChange={(e) => changeMarkup(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Margin %</Label>
          <Input type="number" step="0.01" value={marginStr} onChange={(e) => changeMargin(e.target.value)} />
        </div>
      </div>
      {quantity !== undefined && (
        <p className="mt-2 text-right text-sm text-ink-secondary">
          Item Total: <strong className="text-ink tabular-nums">{formatPeso(round2((quantity || 0) * num(priceStr)))}</strong>
        </p>
      )}
    </div>
  )
}
