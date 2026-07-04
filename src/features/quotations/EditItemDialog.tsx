import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateQuotationItem } from '@/hooks/useQuotations'
import { round2 } from '@/lib/calculations'
import { PriceCalculator } from './PriceCalculator'
import type { QuotationRow } from '@/types/database'

type EditItemDialogProps = {
  quotation: QuotationRow
  onClose: () => void
}

/** Edit a quotation line's description, quantity and pricing. Mount only while open. */
export function EditItemDialog({ quotation, onClose }: EditItemDialogProps) {
  const updateItem = useUpdateQuotationItem()
  const [name, setName] = useState(quotation.item ?? '')
  const [qtyStr, setQtyStr] = useState(String(quotation.quantity_requested ?? 1))
  const [calc, setCalc] = useState({ supplier: quotation.suppliers_price ?? 0, price: quotation.nam_unit_price ?? 0 })

  const quantity = Math.max(0, Math.floor(Number(qtyStr) || 0))

  async function save() {
    if (!name.trim()) {
      toast.error('Item description is required')
      return
    }
    if (quantity < 1) {
      toast.error('Quantity must be at least 1')
      return
    }
    try {
      await updateItem.mutateAsync({
        id: quotation.id,
        patch: {
          item: name.trim(),
          quantity_requested: quantity,
          suppliers_price: calc.supplier,
          nam_unit_price: calc.price,
          total_amount: round2(quantity * calc.price),
        },
      })
      toast.success('Quotation item updated')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Edit Quotation Item" description={`${quotation.quote_ref ?? ''} — ${quotation.company ?? ''}`}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="eq-item">Item description</Label>
          <Input id="eq-item" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eq-qty">Quantity</Label>
          <Input id="eq-qty" type="number" min={1} value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} />
        </div>
        <PriceCalculator
          initialSupplier={quotation.suppliers_price ?? 0}
          initialPrice={quotation.nam_unit_price ?? 0}
          quantity={quantity}
          onChange={setCalc}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={updateItem.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateItem.isPending}>
            {updateItem.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
