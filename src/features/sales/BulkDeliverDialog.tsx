import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDeliverItems } from '@/hooks/useSales'
import type { SaleRow } from '@/types/database'

type BulkDeliverDialogProps = {
  open: boolean
  rows: SaleRow[]
  onClose: () => void
  /** Called after a successful delivery so the page can clear its selection. */
  onDelivered: () => void
}

/**
 * Legacy bulk-delivery modal: every selected pending row with an editable
 * Deliver Qty (default = full). Partial quantities split the row server-side
 * via the deliver_items RPC.
 */
export function BulkDeliverDialog({ open, rows, onClose, onDelivered }: BulkDeliverDialogProps) {
  const deliverItems = useDeliverItems()
  const [quantities, setQuantities] = useState<Record<number, string>>({})

  useEffect(() => {
    if (open) {
      setQuantities(Object.fromEntries(rows.map((r) => [r.id, String(r.quantity_requested ?? 0)])))
    }
  }, [open, rows])

  if (!open) return null

  const items = rows.map((r) => ({
    row: r,
    pending: r.quantity_requested ?? 0,
    deliver: parseInt(quantities[r.id] ?? '', 10),
  }))
  const invalid = items.some((i) => !Number.isFinite(i.deliver) || i.deliver < 1 || i.deliver > i.pending)

  async function onConfirm() {
    if (invalid) {
      toast.error('Deliver quantities must be between 1 and the pending quantity.')
      return
    }
    try {
      const results = await deliverItems.mutateAsync(items.map((i) => ({ id: i.row.id, deliver_qty: i.deliver })))
      const splits = results.filter((r) => r.remainder_qty > 0).length
      toast.success(
        `Delivered ${results.length} item(s)${splits > 0 ? ` — ${splits} split into new pending record(s)` : ''}`,
      )
      onDelivered()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Deliver ${rows.length} selected item(s)`} className="max-w-2xl">
      <p className="mb-3 text-xs text-ink-secondary">
        Adjust the quantities below if you are making a partial delivery. Delivering partial quantities will split
        the remaining amount into a new pending record.
      </p>
      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-page/60 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">PO</th>
              <th className="px-3 py-2 text-right">Pending Qty</th>
              <th className="px-3 py-2 text-right">Deliver Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ row, pending, deliver }) => (
              <tr key={row.id} className="border-b border-hairline last:border-0">
                <td className="max-w-64 truncate px-3 py-2" title={row.item ?? ''}>
                  {row.item || `Sale #${row.id}`}
                  <span className="block text-xs text-ink-muted">{row.company ?? ''}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.po_number || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pending}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    min={1}
                    max={pending}
                    className="ml-auto h-8 w-24 text-right"
                    value={quantities[row.id] ?? ''}
                    onChange={(e) => setQuantities((q) => ({ ...q, [row.id]: e.target.value }))}
                    aria-label={`Deliver quantity for ${row.item ?? `sale #${row.id}`}`}
                    aria-invalid={!Number.isFinite(deliver) || deliver < 1 || deliver > pending}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={deliverItems.isPending}>
          Cancel
        </Button>
        <Button
          className="bg-good text-white hover:bg-[#0a8a0a]"
          onClick={onConfirm}
          disabled={deliverItems.isPending || invalid || rows.length === 0}
        >
          <PackageCheck className="h-4 w-4" />
          {deliverItems.isPending ? 'Delivering…' : 'Confirm Delivery'}
        </Button>
      </div>
    </Dialog>
  )
}
