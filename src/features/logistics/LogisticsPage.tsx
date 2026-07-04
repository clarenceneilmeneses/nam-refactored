import { useMemo, useState } from 'react'
import { Bookmark, CheckCircle2, Clock, PackageCheck, RefreshCw, Search } from 'lucide-react'
import { useSales, SALES_KEY } from '@/hooks/useSales'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { BulkDeliverDialog } from '@/features/sales/BulkDeliverDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { buildDeliveryGroups, isPendingDelivery, pendingRows, type CompanyGroup, type PoGroup } from './logisticsLogic'
import type { SaleRow } from '@/types/database'

const AGING_DAYS = 30
const STALE_DAYS = 90
type SortMode = 'oldest' | 'pending' | 'az'

/** Whole-day age of an order, or null for missing/absurd legacy dates. */
function orderAgeDays(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(`${iso}T00:00:00`).getTime()
  if (Number.isNaN(t)) return null
  const days = Math.floor((Date.now() - t) / 86_400_000)
  // Clamp data-entry errors (e.g. year 0004) so they can't dominate sort/labels.
  if (days < 0 || days > 3650) return null
  return days
}

function agingLevel(days: number | null): 'none' | 'aging' | 'stale' {
  if (days === null) return 'none'
  if (days >= STALE_DAYS) return 'stale'
  if (days >= AGING_DAYS) return 'aging'
  return 'none'
}

function ageLabel(days: number): string {
  if (days < 45) return `${days}d`
  const months = Math.round(days / 30)
  return months < 18 ? `${months} mo` : `${Math.round(days / 365)}y`
}

/** Oldest pending order age in a company group; -1 when none is datable. */
function companyOldestAge(c: CompanyGroup): number {
  let max = -1
  for (const g of c.poGroups) {
    for (const it of g.items) {
      if (!isPendingDelivery(it)) continue
      const d = orderAgeDays(it.date)
      if (d !== null && d > max) max = d
    }
  }
  return max
}

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
  const [sort, setSort] = useState<SortMode>('oldest')
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [deliverRows, setDeliverRows] = useState<SaleRow[]>([])

  const groups = useMemo(() => buildDeliveryGroups(sales ?? [], search), [sales, search])
  const pendingVisible = useMemo(() => pendingRows(groups), [groups])

  // Presentational re-sort of the grouped result (grouping logic untouched).
  const sortedGroups = useMemo(() => {
    const arr = [...groups]
    if (sort === 'pending') arr.sort((a, b) => b.pendingCount - a.pendingCount || a.company.localeCompare(b.company))
    else if (sort === 'az') arr.sort((a, b) => a.company.localeCompare(b.company))
    else arr.sort((a, b) => companyOldestAge(b) - companyOldestAge(a) || a.company.localeCompare(b.company))
    return arr
  }, [groups, sort])

  const agingCount = useMemo(
    () => pendingVisible.filter((r) => (orderAgeDays(r.date) ?? 0) >= AGING_DAYS).length,
    [pendingVisible],
  )
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
      <PageHeader
        title="Deliveries"
        subtitle={`${pendingVisible.length.toLocaleString()} item(s) pending delivery`}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      {!isLoading && groups.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard tone="accent" icon="inventory_2" label="Pending items" value={pendingVisible.length.toLocaleString()} />
          <StatCard tone={agingCount > 0 ? 'warning' : 'neutral'} icon="schedule" label="Aging >30 days" value={agingCount.toLocaleString()} />
          <StatCard tone="neutral" icon="apartment" label="Companies waiting" value={groups.length.toLocaleString()} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input
            className="pl-8"
            placeholder="Search company, PO, or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-auto shrink-0"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort deliveries"
        >
          <option value="oldest">Oldest first</option>
          <option value="pending">Most pending</option>
          <option value="az">Company A–Z</option>
        </Select>
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
        sortedGroups.map((company) => {
          const oldest = companyOldestAge(company)
          const companyLevel = agingLevel(oldest >= 0 ? oldest : null)
          return (
          <Card key={company.company}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="min-w-0 flex-1 truncate" title={company.company}>
                {company.company}
              </CardTitle>
              {companyLevel !== 'none' && (
                <Badge variant={companyLevel === 'stale' ? 'serious' : 'warning'} title={`Oldest pending order is ${ageLabel(oldest)} old`}>
                  <Clock className="h-3 w-3" /> {ageLabel(oldest)}
                </Badge>
              )}
              <Badge variant="accent" className="shrink-0">{company.pendingCount} pending</Badge>
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
          )
        })
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
        {group.items.map((sale) => {
          const age = orderAgeDays(sale.date)
          const level = agingLevel(age)
          return isPendingDelivery(sale) ? (
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
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <span>Qty {sale.quantity_requested ?? 0}</span>
                  <span aria-hidden>·</span>
                  <span>Ordered {formatDate(sale.date)}</span>
                  {level !== 'none' && age !== null && (
                    <Badge variant={level === 'stale' ? 'serious' : 'warning'}>
                      <Clock className="h-3 w-3" /> Aging {ageLabel(age)}
                    </Badge>
                  )}
                  {sale.is_reserved && (
                    <Badge variant="warning">
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
          )
        })}
      </div>
    </div>
  )
}

