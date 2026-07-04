import { useEffect, useMemo, useRef, useState } from 'react'
import { createColumnHelper, type ColumnDef, type RowSelectionState } from '@tanstack/react-table'
import { AlertTriangle, GitMerge, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteProduct, useProducts, PRODUCTS_KEY } from '@/hooks/useProducts'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPeso } from '@/lib/format'
import type { ProductRow } from '@/types/database'
import { ProductFormDialog } from './ProductFormDialog'
import { MergeProductsDialog } from './MergeProductsDialog'

const col = createColumnHelper<ProductRow>()

type StockView = '' | 'low' | 'out' | 'draft'

function StockBadge({ product }: { product: ProductRow }) {
  const stock = product.current_stock ?? 0
  if (stock === 0)
    return (
      <Badge variant="critical">
        <AlertTriangle className="h-3 w-3" /> Out
      </Badge>
    )
  if (stock <= (product.reorder_level ?? 10))
    return (
      <Badge variant="warning">
        <AlertTriangle className="h-3 w-3" /> {stock} low
      </Badge>
    )
  return <Badge variant="neutral">{stock}</Badge>
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
  const [view, setView] = useState<StockView>('')
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
          (view !== 'out' || (p.current_stock ?? 0) === 0) &&
          (view !== 'draft' || !!p.is_draft),
      ),
    [products, category, view],
  )

  const stats = useMemo(() => {
    const list = products ?? []
    let drafts = 0
    let out = 0
    let uncat = 0
    for (const p of list) {
      if (p.is_draft) drafts += 1
      if ((p.current_stock ?? 0) === 0) out += 1
      if (!p.category_code || p.category_code === 'Uncategorized') uncat += 1
    }
    return { total: list.length, drafts, out, uncat }
  }, [products])

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
      <PageHeader
        title="Products"
        subtitle={`${(products ?? []).length.toLocaleString()} products in catalog`}
        actions={
          <>
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
          </>
        }
      />

      {!isLoading && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard tone="accent" icon="inventory_2" label="Products in catalog" value={stats.total.toLocaleString()} />
          <StatCard tone="warning" icon="edit_note" label="Draft products" value={stats.drafts.toLocaleString()} />
          <StatCard tone="critical" icon="warning" label="Out of stock" value={stats.out.toLocaleString()} />
          <StatCard tone="serious" icon="sell" label="Uncategorized" value={stats.uncat.toLocaleString()} />
        </div>
      )}

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
        <div className="flex overflow-hidden rounded-md border border-hairline">
          {(
            [
              ['', 'All'],
              ['low', 'Low stock'],
              ['out', 'Out of stock'],
              ['draft', 'Drafts'],
            ] as Array<[StockView, string]>
          ).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              className={cn(
                'px-3 py-1.5 text-xs font-medium cursor-pointer',
                view === value ? 'bg-accent text-white' : 'bg-surface text-ink-secondary hover:bg-page',
              )}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
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
