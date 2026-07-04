import { useMemo, useState } from 'react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useSales, useUpdateSale, SALES_KEY } from '@/hooks/useSales'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { DataTable } from '@/components/shared/DataTable'
import { OverdueBadge } from '@/components/shared/StatusBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { isOverdue, round2 } from '@/lib/calculations'
import { formatDate, formatPeso, toISODate } from '@/lib/format'
import type { SaleRow } from '@/types/database'

const col = createColumnHelper<SaleRow>()

function PaymentStatusEditor({ sale }: { sale: SaleRow }) {
  const updateSale = useUpdateSale()
  return (
    <Select
      className="h-8 w-28 text-xs"
      value={sale.payment_status ?? 'Pending'}
      aria-label={`Payment status for sale ${sale.id}`}
      onChange={async (e) => {
        const status = e.target.value
        try {
          await updateSale.mutateAsync({
            id: sale.id,
            patch: {
              payment_status: status,
              // Stamp date_paid when marked Paid; clear it when reverted.
              date_paid: status === 'Paid' ? new Date().toISOString() : null,
            },
          })
          toast.success(`Sale #${sale.id} marked ${status}`)
        } catch (err) {
          toast.error((err as Error).message)
        }
      }}
    >
      <option>Pending</option>
      <option>Partial</option>
      <option>Paid</option>
    </Select>
  )
}

function SiNumberEditor({ sale }: { sale: SaleRow }) {
  const updateSale = useUpdateSale()
  const [value, setValue] = useState(sale.si_number ?? '')
  return (
    <Input
      className="h-8 w-24 text-xs"
      value={value}
      aria-label={`SI number for sale ${sale.id}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (sale.si_number ?? '')) {
          updateSale.mutate({ id: sale.id, patch: { si_number: value || null } })
        }
      }}
    />
  )
}

export function FinancePage() {
  const { data: sales, isLoading, error } = useSales()
  useRealtimeInvalidate('sales', SALES_KEY)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('unpaid') // default: needs attention

  const rows = useMemo(() => {
    const all = sales ?? []
    switch (statusFilter) {
      case 'unpaid':
        return all.filter((s) => (s.payment_status ?? 'Pending') !== 'Paid')
      case 'overdue':
        return all.filter(isOverdue)
      case 'paid':
        return all.filter((s) => s.payment_status === 'Paid')
      default:
        return all
    }
  }, [sales, statusFilter])

  const summary = useMemo(() => {
    const all = sales ?? []
    const unpaid = all.filter((s) => (s.payment_status ?? 'Pending') !== 'Paid')
    const overdue = unpaid.filter(isOverdue)
    const today = toISODate(new Date()).slice(0, 7)
    const collectedThisMonth = all
      .filter((s) => s.payment_status === 'Paid' && s.date_paid?.slice(0, 7) === today)
      .reduce((sum, s) => sum + (s.total_amount_due ?? 0), 0)
    return {
      receivable: round2(unpaid.reduce((sum, s) => sum + (s.total_amount_due ?? 0), 0)),
      unpaidCount: unpaid.length,
      overdueAmount: round2(overdue.reduce((sum, s) => sum + (s.total_amount_due ?? 0), 0)),
      overdueCount: overdue.length,
      collectedThisMonth: round2(collectedThisMonth),
    }
  }, [sales])

  const columns = useMemo<ColumnDef<SaleRow, unknown>[]>(
    () =>
      [
        col.accessor('date', { header: 'Date', cell: (c) => <span className="whitespace-nowrap">{formatDate(c.getValue())}</span> }),
        col.accessor('company', {
          header: 'Company',
          cell: (c) => <span className="block max-w-48 truncate" title={c.getValue() ?? ''}>{c.getValue() || '—'}</span>,
        }),
        col.accessor('item', {
          header: 'Item',
          cell: (c) => <span className="block max-w-52 truncate" title={c.getValue() ?? ''}>{c.getValue() || '—'}</span>,
        }),
        col.accessor('total_nam_amount', {
          header: 'Total',
          cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatPeso(c.getValue())}</span>,
        }),
        col.accessor('withholding_tax', {
          header: 'WHT',
          cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatPeso(c.getValue())}</span>,
        }),
        col.accessor('total_amount_due', {
          header: 'Amount due',
          cell: (c) => <span className="whitespace-nowrap font-medium tabular-nums">{formatPeso(c.getValue())}</span>,
        }),
        col.accessor('due_date', {
          header: 'Due date',
          cell: (c) => (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {formatDate(c.getValue())}
              {isOverdue(c.row.original) && <OverdueBadge />}
            </span>
          ),
        }),
        col.accessor('payment_status', {
          header: 'Status',
          cell: (c) => <PaymentStatusEditor sale={c.row.original} />,
        }),
        col.accessor('date_paid', {
          header: 'Date paid',
          cell: (c) => <span className="whitespace-nowrap">{formatDate(c.getValue())}</span>,
        }),
        col.accessor('si_number', {
          header: 'SI #',
          cell: (c) => <SiNumberEditor key={c.row.original.id} sale={c.row.original} />,
        }),
      ] as ColumnDef<SaleRow, unknown>[],
    [],
  )

  if (error) return <p className="text-sm text-critical">Couldn’t load finance data: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <PageHeader title="Finance" subtitle="Payment tracking and receivables" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          tone="accent"
          icon="hourglass_top"
          label="Outstanding receivables"
          value={isLoading ? <Skeleton className="h-6 w-28" /> : formatPeso(summary.receivable)}
          hint={!isLoading && `${summary.unpaidCount.toLocaleString()} unpaid invoice(s)`}
        />
        <StatCard
          tone={summary.overdueCount > 0 ? 'critical' : 'neutral'}
          icon="warning"
          label="Overdue"
          value={isLoading ? <Skeleton className="h-6 w-28" /> : formatPeso(summary.overdueAmount)}
          hint={!isLoading && `${summary.overdueCount.toLocaleString()} overdue invoice(s)`}
        />
        <StatCard
          tone="good"
          icon="payments"
          label="Collected this month"
          value={isLoading ? <Skeleton className="h-6 w-28" /> : formatPeso(summary.collectedThisMonth)}
          hint={!isLoading && 'Based on date paid'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input className="w-64 pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Payment filter">
          <option value="unpaid">Unpaid (Pending + Partial)</option>
          <option value="overdue">Overdue only</option>
          <option value="paid">Paid</option>
          <option value="all">All sales</option>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          pageSize={50}
          rowClassName={(row) => (isOverdue(row) ? 'bg-[#d03b3b]/4' : '')}
        />
      )}
    </div>
  )
}

