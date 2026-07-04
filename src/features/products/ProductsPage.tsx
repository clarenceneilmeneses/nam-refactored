import { useEffect, useMemo, useRef, useState } from 'react'
import { createColumnHelper, type ColumnDef, type RowSelectionState } from '@tanstack/react-table'
import { AlertTriangle, GitMerge, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteProduct, useProducts, PRODUCTS_KEY } from '@/hooks/useProducts'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatPeso } from '@/lib/format'
import type { ProductRow } from '@/types/database'
import { ProductFormDialog } from './ProductFormDialog'
import { MergeProductsDialog } from './MergeProductsDialog'

const col = createColumnHelper<ProductRow>()

function StockBadge({ product }: { product: ProductRow }) {
  const stock = product.current_stock ?? 0
  const low = stock <= (product.reorder_level ?? 10)
  if (!low) return <Badge variant="neutral">{stock}</Badge>
  return (
    <Badge variant="critical">
      <AlertTriangle className="h-3 w-3" /> {stock} left
    </Badge>
  )
}

/** Checkbox that supports the indeterminate visual state (header select-all). */
function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 accent-[#2a78d6]"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  )
}

export function ProductsPage() {
  const { data: products, isLoading, error } = useProducts()
  useRealtimeInvalidate('products', PRODUCTS_KEY)
  const deleteProduct = useDeleteProduct()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState('') // '' | low | draft
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleting, setDeleting] = useState<ProductRow | null>(null)

  const categories = useMemo(
    () => [...new Set((products ?? []).map((p) => p.category_code).filter((c): c is string => !!c))].sort(),
    [products],
  )

  const filtered = useMemo(
    () =>
      (products ?? []).filter(
        (p) =>
          (!category || p.category_code === category) &&
          (view !== 'low' || (p.current_stock ?? 0) <= (p.reorder_level ?? 10)) &&
          (view !== 'draft' || !!p.is_draft),
      ),
    [products, category, view],
  )

  const selectedProducts = useMemo(
    () => (products ?? []).filter((p) => rowSelection[String(p.id)]),
    [products, rowSelection],
  )

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () =>
      [
        col.display({
          id: 'select',
          enableSorting: false,
          header: ({ table }) => (
            <RowCheckbox
              label="Select all on page"
              checked={table.getIsAllPageRowsSelected()}
              indeterminate={table.getIsSomePageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          ),
          cell: ({ row }) => (
            <RowCheckbox
              label={`Select ${row.original.name}`}
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          ),
          meta: { thClassName: 'w-8', tdClassName: 'w-8' },
        }),
        col.accessor('name', {
          header: 'Product',
          cell: (c) => (
            <span className="flex max-w-80 items-center gap-2">
              <span className="truncate" title={c.getValue()}>{c.getValue()}</span>
              {c.row.original.is_draft && <Badge variant="neutral">Draft</Badge>}
            </span>
          ),
        }),
        col.accessor('category_code', { header: 'Category', cell: (c) => c.getValue() || '—' }),
        col.accessor('unit', { header: 'Unit', cell: (c) => c.getValue() || '—' }),
        col.accessor('supplier', {
          header: 'Supplier',
          cell: (c) => <span className="block max-w-40 truncate" title={c.getValue() ?? ''}>{c.getValue() || '—'}</span>,
        }),
        col.accessor('supplier_price', {
          header: 'Supp. Price',
          cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatPeso(c.getValue())}</span>,
          meta: { thClassName: 'text-right', tdClassName: 'text-right' },
        }),
        col.accessor('nam_price', {
          header: 'NAM Price',
          cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatPeso(c.getValue())}</span>,
          meta: { thClassName: 'text-right', tdClassName: 'text-right' },
        }),
        col.accessor('margin', {
          header: 'Margin',
          cell: (c) => <span className="tabular-nums">{c.getValue() || '—'}</span>,
          meta: { thClassName: 'text-center', tdClassName: 'text-center' },
        }),
        col.accessor('current_stock', {
          header: 'Inventory',
          cell: (c) => <StockBadge product={c.row.original} />,
          meta: { thClassName: 'text-center', tdClassName: 'text-center' },
        }),
        col.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => { setEditing(row.original); setFormOpen(true) }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete" onClick={() => setDeleting(row.original)}>
                <Trash2 className="h-3.5 w-3.5 text-critical" />
              </Button>
            </span>
          ),
        }),
      ] as ColumnDef<ProductRow, unknown>[],
    [],
  )

  if (error) return <p className="text-sm text-critical">Couldn’t load products: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Products</h1>
          <p className="text-xs text-ink-muted">{(products ?? []).length.toLocaleString()} products in catalog</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedProducts.length < 2}
            title={selectedProducts.length < 2 ? 'Select at least 2 products to merge' : undefined}
            onClick={() => setMergeOpen(true)}
          >
            <GitMerge className="h-3.5 w-3.5" />
            Merge duplicates{selectedProducts.length >= 2 && ` (${selectedProducts.length})`}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus className="h-3.5 w-3.5" /> New product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input className="w-64 pl-8" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select className="w-auto" value={view} onChange={(e) => setView(e.target.value)} aria-label="View filter">
          <option value="">All products</option>
          <option value="low">Low stock only</option>
          <option value="draft">Drafts only</option>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          pageSize={50}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(p) => String(p.id)}
        />
      )}

      <ProductFormDialog open={formOpen} product={editing} onClose={() => setFormOpen(false)} />
      <MergeProductsDialog
        open={mergeOpen}
        selected={selectedProducts}
        onClose={() => setMergeOpen(false)}
        onMerged={() => setRowSelection({})}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete product?"
        description={`"${deleting?.name}" will be removed from the catalog. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deleteProduct.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteProduct.mutateAsync(deleting)
            toast.success('Product deleted')
            setDeleting(null)
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />
    </div>
  )
}
