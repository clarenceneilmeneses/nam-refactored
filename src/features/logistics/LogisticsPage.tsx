import { useMemo, useState } from 'react'
import { Bookmark, CheckCircle2, PackageCheck, RefreshCw, Search } from 'lucide-react'
import { useSales, SALES_KEY } from '@/hooks/useSales'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { BulkDeliverDialog } from '@/features/sales/BulkDeliverDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { buildDeliveryGroups, isPendingDelivery, pendingRows, type PoGroup } from './logisticsLogic'
import type { SaleRow } from '@/types/database'

/**
 * Driver view (legacy delivery_view.php), mobile-first: undelivered sales
 * grouped Company → PO with a per-PO progress bar; delivered rows of a group
 * stay visible as a delivery log. Single and bulk deliveries both go through
 * the shared deliver_items RPC dialog (partial split + due-date stamping).
 */
export function LogisticsPage() {
  const { data: sales, isLoading, isFetching, error, refetch } = useSales()
  useRealtimeInvalidate('sales', SALES_KEY)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [deliverRows, setDeliverRows] = useState<SaleRow[]>([])

  const groups = useMemo(() => buildDeliveryGroups(sales ?? [], search), [sales, search])
  const pendingVisible = useMemo(() => pendingRows(groups), [groups])
  // Selection survives refetches; rows that got delivered simply drop out here.
  const selectedRows = useMemo(() => pendingVisible.filter((r) => selected.has(r.id)), [pendingVisible, selected])
  const allSelected = pendingVisible.length > 0 && pendingVisible.every((r) => selected.has(r.id))

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pendingVisible.map((r) => r.id)))
  }

  function onDelivered() {
    const done = new Set(deliverRows.map((r) => r.id))
    setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))))
  }

  if (error) return <p className="text-sm text-critical">Couldn’t load deliveries: {(error as Error).message}</p>

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Deliveries</h1>
          <p className="text-xs text-ink-muted">{pendingVisible.length.toLocaleString()} item(s) pending delivery</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
        <Input
          className="pl-8"
          placeholder="Search company, PO, or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {pendingVisible.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            className="h-5 w-5 cursor-pointer accent-[#2a78d6]"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all pending items"
          />
          Select all pending ({pendingVisible.length})
        </label>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : groups.length === 0 ? (
        <EmptyState title="No pending deliveries found." />
      ) : (
        groups.map((company) => (
          <Card key={company.company}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="max-w-[70%] truncate" title={company.company}>
                {company.company}
              </CardTitle>
              <Badge variant="accent">{company.pendingCount} pending</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {company.poGroups.map((group) => (
                <PoSection
                  key={group.po || '(none)'}
                  group={group}
                  selected={selected}
                  onToggle={toggleOne}
                  onDeliver={(row) => setDeliverRows([row])}
                />
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <button
              type="button"
              className="cursor-pointer text-xs text-ink-muted underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
            <Button
              size="lg"
              className="bg-good text-white hover:bg-[#0a8a0a]"
              onClick={() => setDeliverRows(selectedRows)}
            >
              <PackageCheck className="h-4 w-4" /> Deliver Selected ({selectedRows.length})
            </Button>
          </div>
        </div>
      )}

      <BulkDeliverDialog
        open={deliverRows.length > 0}
        rows={deliverRows}
        onClose={() => setDeliverRows([])}
        onDelivered={onDelivered}
      />
    </div>
  )
}

function PoSection({
  group,
  selected,
  onToggle,
  onDeliver,
}: {
  group: PoGroup
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onDeliver: (row: SaleRow) => void
}) {
  const complete = group.deliveredCount === group.totalCount
  const pct = group.totalCount === 0 ? 0 : Math.round((group.deliveredCount / group.totalCount) * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold tracking-wide text-ink-secondary uppercase" title={group.label}>
          {group.label}
        </p>
        <Badge variant={complete ? 'good' : 'accent'}>
          {group.deliveredCount}/{group.totalCount} items
        </Badge>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
        <div
          className={cn('h-full rounded-full transition-all', complete ? 'bg-good' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {group.items.map((sale) =>
          isPendingDelivery(sale) ? (
            <div key={sale.id} className="flex items-center gap-3 rounded-lg border border-hairline p-3">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 cursor-pointer accent-[#2a78d6]"
                checked={selected.has(sale.id)}
                onChange={() => onToggle(sale.id)}
                aria-label={`Select ${sale.item ?? `sale #${sale.id}`}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={sale.item ?? ''}>
                  {sale.item || `Sale #${sale.id}`}
                </p>
                <p className="text-xs text-ink-muted">
                  Qty {sale.quantity_requested ?? 0}
                  {sale.is_reserved && (
                    <Badge variant="warning" className="ml-1.5">
                      <Bookmark className="h-3 w-3" /> Reserved
                    </Badge>
                  )}
                </p>
              </div>
              <Button size="sm" className="h-10 shrink-0 rounded-full px-5" onClick={() => onDeliver(sale)}>
                Deliver
              </Button>
            </div>
          ) : (
            <div key={sale.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-page/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-secondary" title={sale.item ?? ''}>
                  {sale.item || `Sale #${sale.id}`}
                </p>
                <p className="text-xs text-ink-muted">Qty {sale.quantity_requested ?? 0}</p>
              </div>
              <p className="flex shrink-0 items-center gap-1 text-xs font-medium text-good-text">
                <CheckCircle2 className="h-3.5 w-3.5" /> Delivered · {formatDate(sale.date_delivered)}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
