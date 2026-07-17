import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { useCategories, useCreateCategory } from '@/hooks/useCategories'
import { computeProductMargin } from '@/lib/calculations'
import { PriceCalculator, type CalcValues } from '@/features/quotations/PriceCalculator'
import type { ProductRow } from '@/types/database'

type Draft = {
  name: string
  category_code: string
  unit: string
  supplier: string
  supplier_price: number
  nam_price: number
  current_stock: string
  reorder_level: string
}

function emptyDraft(): Draft {
  return {
    name: '',
    category_code: '',
    unit: '',
    supplier: '',
    supplier_price: 0,
    nam_price: 0,
    current_stock: '0',
    reorder_level: '10',
  }
}

function toDraft(p: ProductRow): Draft {
  return {
    name: p.name,
    category_code: p.category_code ?? '',
    unit: p.unit ?? '',
    supplier: p.supplier ?? '',
    supplier_price: p.supplier_price ?? 0,
    nam_price: p.nam_price ?? 0,
    current_stock: String(p.current_stock ?? 0),
    reorder_level: String(p.reorder_level ?? 10),
  }
}

/**
 * Add/Edit product modal (legacy save_product.php). Pricing uses the same
 * four-way calculator as quotations; margin is stored as the formatted
 * string the legacy app kept ("35.00%"). Saving a draft product completes
 * it (clears is_draft).
 */
export function ProductFormDialog({
  open,
  product,
  onClose,
}: {
  open: boolean
  product: ProductRow | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const { names: categories } = useCategories()
  const createCategory = useCreateCategory()
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(product ? toDraft(product) : emptyDraft())
      setAddingCategory(false)
      setNewCategory('')
    }
  }, [open, product])

  // A product may carry a category that predates the categories table
  // (e.g. "Uncategorized" drafts) — keep it selectable instead of blanking it.
  const categoryOptions =
    draft.category_code && !categories.includes(draft.category_code)
      ? [draft.category_code, ...categories]
      : categories

  async function saveNewCategory() {
    try {
      const saved = await createCategory.mutateAsync(newCategory)
      set('category_code', saved.name)
      setAddingCategory(false)
      setNewCategory('')
      toast.success(`Category "${saved.name}" added`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function onCalcChange({ supplier, price }: CalcValues) {
    setDraft((d) => ({ ...d, supplier_price: supplier, nam_price: price }))
  }

  async function onSave() {
    if (!draft.name.trim()) {
      toast.error('Product name is required')
      return
    }
    if (draft.supplier_price <= 0 || draft.nam_price <= 0) {
      toast.error('Supplier price and NAM price are required')
      return
    }
    const payload = {
      name: draft.name.trim(),
      category_code: draft.category_code || null,
      unit: draft.unit.trim() || null,
      supplier: draft.supplier.trim() || null,
      supplier_price: draft.supplier_price,
      nam_price: draft.nam_price,
      margin: computeProductMargin(draft.supplier_price, draft.nam_price),
      current_stock: Number(draft.current_stock) || 0,
      reorder_level: Number(draft.reorder_level) || 0,
      // Saving always completes the product; drafts auto-created from
      // quotations lose their draft flag here.
      is_draft: false,
    }
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, patch: payload })
      } else {
        await create.mutateAsync(payload)
      }
      toast.success('Product saved')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onClose={onClose} title={product ? 'Edit product' : 'New product'} className="max-w-xl">
      <div className="space-y-3">
        {product?.is_draft && (
          <p className="flex items-center gap-2 rounded-md bg-page px-3 py-2 text-xs text-ink-secondary">
            <Badge variant="neutral">Draft</Badge>
            Auto-created from a quotation — saving completes it.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label>Name *</Label>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              {!addingCategory && (
                <button
                  type="button"
                  className="text-xs font-medium text-accent hover:underline cursor-pointer"
                  onClick={() => setAddingCategory(true)}
                >
                  + New
                </button>
              )}
            </div>
            {addingCategory ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={newCategory}
                  placeholder="New category name"
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void saveNewCategory()
                    }
                    if (e.key === 'Escape') setAddingCategory(false)
                  }}
                />
                <Button size="sm" onClick={saveNewCategory} disabled={createCategory.isPending || !newCategory.trim()}>
                  {createCategory.isPending ? '…' : 'Add'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingCategory(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Select value={draft.category_code} onChange={(e) => set('category_code', e.target.value)}>
                <option value="">— Select —</option>
                {categoryOptions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <Label>Unit</Label>
            <Input value={draft.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. PC, BOX" />
          </div>
          <div className="space-y-1">
            <Label>Supplier</Label>
            <Input value={draft.supplier} onChange={(e) => set('supplier', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Current stock</Label>
            <Input type="number" min={0} value={draft.current_stock} onChange={(e) => set('current_stock', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reorder level</Label>
            <Input type="number" min={0} value={draft.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} />
          </div>
        </div>
        <div className="rounded-md border border-hairline bg-page/40 p-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Pricing</p>
          <PriceCalculator
            key={product?.id ?? 'new'}
            initialSupplier={product?.supplier_price ?? 0}
            initialPrice={product?.nam_price ?? 0}
            supplierLabel="Supplier Price *"
            priceLabel="NAM Price *"
            onChange={onCalcChange}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</Button>
      </div>
    </Dialog>
  )
}
