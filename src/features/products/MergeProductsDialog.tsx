import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMergeProducts } from '@/hooks/useProducts'
import { formatPeso } from '@/lib/format'
import type { ProductRow } from '@/types/database'

/**
 * Merge the products selected in the table (legacy merge_products.php):
 * choose the canonical row to keep — its stock becomes the sum of all
 * selected rows and the others are deleted. Sales/quotations reference
 * items by name text, so historical rows are left untouched.
 */
export function MergeProductsDialog({
  open,
  selected,
  onClose,
  onMerged,
}: {
  open: boolean
  selected: ProductRow[]
  onClose: () => void
  onMerged: () => void
}) {
  const [canonicalId, setCanonicalId] = useState<number | null>(null)
  const merge = useMergeProducts()

  useEffect(() => {
    if (open) setCanonicalId(selected[0]?.id ?? null)
  }, [open, selected])

  const canonical = selected.find((p) => p.id === canonicalId) ?? null
  const duplicates = selected.filter((p) => p.id !== canonicalId)
  const combinedStock = selected.reduce((s, p) => s + (p.current_stock ?? 0), 0)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Merge duplicate products"
      description="Choose the product to keep. Stock from the others is added to it, then they are deleted."
      className="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="max-h-72 overflow-y-auto rounded-md border border-hairline">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline bg-page/60 text-left text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="px-2 py-1.5">Keep</th>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Category</th>
                <th className="px-2 py-1.5 text-right">Selling price</th>
                <th className="px-2 py-1.5 text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-hairline last:border-0 hover:bg-page/70" onClick={() => setCanonicalId(p.id)}>
                  <td className="px-2 py-1.5">
                    <input
                      type="radio"
                      name="canonical"
                      className="accent-[#2a78d6]"
                      checked={canonicalId === p.id}
                      onChange={() => setCanonicalId(p.id)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.is_draft && <Badge variant="neutral">Draft</Badge>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{p.category_code || '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeso(p.nam_price)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.current_stock ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canonical && (
          <p className="rounded-md bg-page px-3 py-2 text-xs text-ink-secondary">
            Keeping <strong>{canonical.name}</strong> · deleting {duplicates.length} duplicate(s) · combined stock will be{' '}
            <strong>{combinedStock}</strong>
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!canonical || duplicates.length === 0 || merge.isPending}
            onClick={async () => {
              if (!canonical) return
              try {
                await merge.mutateAsync({ canonical, duplicates })
                toast.success(`Merged ${duplicates.length} duplicate(s) into "${canonical.name}"`)
                onMerged()
                onClose()
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            {merge.isPending ? 'Merging…' : `Merge ${selected.length} products`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
