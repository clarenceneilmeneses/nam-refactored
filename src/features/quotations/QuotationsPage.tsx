import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  QUOTATIONS_KEY,
  useApproveQuotation,
  useDeleteQuotationGroup,
  useFinalizeQuotation,
  useQuotations,
  useRemoveQuotationItem,
  useToggleReserve,
} from '@/hooks/useQuotations'
import { useClients } from '@/hooks/useClients'
import { useSales } from '@/hooks/useSales'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPeso, toISODate } from '@/lib/format'
import { round2 } from '@/lib/calculations'
import type { QuotationRow } from '@/types/database'
import { DraftWorkspace, type WorkspaceMode } from './DraftWorkspace'
import { FormalQuotePreview } from './FormalQuotePreview'
import { EditItemDialog } from './EditItemDialog'
import { EditGroupDialog } from './EditGroupDialog'
import { MergeClientsDialog } from './MergeClientsDialog'
import { ClientRail } from './ClientRail'
import { ClientDetail } from './ClientDetail'
import {
  buildCompanyGroups,
  daysBetween,
  rollupCompany,
  STALE_DAYS,
  statusOf,
  type QuotationActions,
  type RefGroup,
  type Segment,
  type SortMode,
} from './quotationModel'

export function QuotationsPage() {
  const { data: quotations, isLoading, error } = useQuotations()
  const { data: clients } = useClients()
  const { data: sales } = useSales()
  useRealtimeInvalidate('quotations', QUOTATIONS_KEY)

  const approve = useApproveQuotation()
  const finalize = useFinalizeQuotation()
  const removeItem = useRemoveQuotationItem()
  const deleteGroup = useDeleteQuotationGroup()
  const toggleReserve = useToggleReserve()

  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<Segment>('all')
  const [sort, setSort] = useState<SortMode>('recent')
  const [selected, setSelected] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [workspace, setWorkspace] = useState<WorkspaceMode | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<QuotationRow | null>(null)
  const [editingGroup, setEditingGroup] = useState<RefGroup | null>(null)
  const [printGroup, setPrintGroup] = useState<RefGroup | null>(null)
  const [confirmApprove, setConfirmApprove] = useState<QuotationRow | null>(null)
  const [confirmFinalize, setConfirmFinalize] = useState<QuotationRow | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<QuotationRow | null>(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<RefGroup | null>(null)

  // Touch devices keep per-item actions always visible (no hover to reveal on).
  const [coarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
  )

  // Whole-table status stats for the cards (unchanged math).
  const stats = useMemo(() => {
    const sums = {
      Pending: { count: 0, amount: 0, staleAmount: 0 },
      Approved: { count: 0, amount: 0 },
      Reserved: { count: 0, amount: 0 },
      Converted: { count: 0, amount: 0 },
    }
    const now = new Date()
    for (const q of quotations ?? []) {
      const s = statusOf(q)
      const bucket = s in sums ? sums[s as keyof typeof sums] : sums.Pending
      bucket.count += 1
      bucket.amount += q.total_amount ?? 0
      if (bucket === sums.Pending && daysBetween(q.date, now) >= STALE_DAYS) sums.Pending.staleAmount += q.total_amount ?? 0
    }
    return sums
  }, [quotations])

  const groups = useMemo(() => buildCompanyGroups(quotations), [quotations])

  // Search + segment filter, then sort. Filtering re-rolls each company from its
  // surviving refs so badges/values reflect the filtered view.
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = []
    for (const group of groups) {
      const companyHit = q !== '' && group.company.toLowerCase().includes(q)
      let refs = group.refs
      if (q && !companyHit) {
        refs = refs.filter(
          (r) => r.quoteRef.toLowerCase().includes(q) || r.items.some((i) => (i.item ?? '').toLowerCase().includes(q)),
        )
      }
      if (segment === 'action') refs = refs.filter((r) => r.actionCount > 0)
      else if (segment === 'converted') refs = refs.filter((r) => r.actionCount === 0)
      if (refs.length === 0) continue
      result.push(refs === group.refs ? group : rollupCompany(group.company, refs))
    }
    result.sort((a, b) => {
      if (sort === 'name') return a.company.localeCompare(b.company)
      if (sort === 'value') return b.openValue - a.openValue
      return b.latestDate.localeCompare(a.latestDate) // recent
    })
    return result
  }, [groups, search, segment, sort])

  const searching = search.trim() !== ''

  // Keep a valid selection: default to / fall back to the first visible client.
  useEffect(() => {
    if (visibleGroups.length === 0) {
      if (selected !== null) setSelected(null)
      return
    }
    if (!selected || !visibleGroups.some((g) => g.company === selected)) {
      setSelected(visibleGroups[0].company)
    }
  }, [visibleGroups, selected])

  const selectedGroup = useMemo(
    () => visibleGroups.find((g) => g.company === selected) ?? null,
    [visibleGroups, selected],
  )

  // Client master first, latest sales row as fallback (clients table may be empty).
  function clientAddress(company: string | null): string | null {
    if (!company) return null
    const name = company.trim().toLowerCase()
    const client = (clients ?? []).find((c) => c.company_name.trim().toLowerCase() === name)
    if (client?.address) return client.address
    const sale = (sales ?? []).find((s) => (s.company ?? '').trim().toLowerCase() === name && s.address)
    return sale?.address ?? null
  }

  async function run<T>(mutate: () => Promise<T>, success: string, cleanup?: () => void) {
    try {
      await mutate()
      toast.success(success)
      cleanup?.()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const actions: QuotationActions = {
    onAddItem: (ref) =>
      setWorkspace({
        kind: 'addItem',
        group: {
          company: ref.company,
          quoteRef: ref.quoteRef,
          poNumber: ref.poNumber,
          paymentTerm: ref.paymentTerm,
          remarks: ref.remarks,
        },
      }),
    onEditGroup: (ref) => setEditingGroup(ref),
    onPrintGroup: (ref) => setPrintGroup(ref),
    onDeleteGroup: (ref) => setConfirmDeleteGroup(ref),
    onBuyAgain: (q) =>
      setWorkspace({
        kind: 'buyAgain',
        company: q.company,
        item: {
          item: q.item ?? '',
          category: q.category,
          quantity: q.quantity_requested ?? 1,
          suppliers_price: q.suppliers_price ?? 0,
          nam_unit_price: q.nam_unit_price ?? 0,
        },
      }),
    onEditItem: (q) => setEditingItem(q),
    onToggleReserve: (q) =>
      run(() => toggleReserve.mutateAsync(q), q.status === 'Reserved' ? 'Reservation released' : 'Stock reserved'),
    onApprove: (q) => setConfirmApprove(q),
    onFinalize: (q) => setConfirmFinalize(q),
    onRemove: (q) => setConfirmRemove(q),
    reserveBusy: toggleReserve.isPending,
    revealOnHover: !coarse,
  }

  function selectClient(company: string) {
    setSelected(company)
    setMobileView('detail')
  }

  if (error) return <p className="text-sm text-critical">Couldn’t load quotations: {(error as Error).message}</p>

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Header */}
      <PageHeader
        title="Quotations"
        subtitle={`${(quotations ?? []).length.toLocaleString()} quotation lines across ${groups.length} clients`}
        actions={
          <Button size="sm" onClick={() => setWorkspace({ kind: 'create' })}>
            <Plus className="h-3.5 w-3.5" /> Create New Quotation
          </Button>
        }
      />

      {/* Status stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          tone="warning"
          icon="schedule"
          label="Pending Review"
          value={stats.Pending.count.toLocaleString()}
          hint={
            <>
              {formatPeso(stats.Pending.amount)}
              {stats.Pending.staleAmount > 0 && (
                <span className="mt-0.5 block text-[#b06000]">{formatPeso(stats.Pending.staleAmount)} older than 90 days</span>
              )}
            </>
          }
        />
        <StatCard tone="accent" icon="verified" label="Approved & Ready" value={stats.Approved.count.toLocaleString()} hint={formatPeso(stats.Approved.amount)} />
        <StatCard tone="critical" icon="bookmark" label="Reserved Stock" value={stats.Reserved.count.toLocaleString()} hint={formatPeso(stats.Reserved.amount)} />
        <StatCard tone="good" icon="task_alt" label="Converted to Sales" value={stats.Converted.count.toLocaleString()} hint={formatPeso(stats.Converted.amount)} />
      </div>

      {/* Master–detail */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
          <div className={cn('min-h-0', mobileView === 'detail' && 'hidden lg:block')}>
            <ClientRail
              groups={visibleGroups}
              selected={selected}
              onSelect={selectClient}
              search={search}
              onSearch={setSearch}
              segment={segment}
              onSegment={setSegment}
              sort={sort}
              onSort={setSort}
              searching={searching}
              onMerge={() => setMergeOpen(true)}
            />
          </div>
          <div className={cn('min-h-0', mobileView === 'list' && 'hidden lg:block')}>
            {selectedGroup ? (
              <ClientDetail
                group={selectedGroup}
                address={clientAddress(selectedGroup.company)}
                searching={searching}
                actions={actions}
                onNewQuote={(company) => setWorkspace({ kind: 'create', company })}
                onBack={() => setMobileView('list')}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-hairline bg-surface">
                <EmptyState
                  title="No quotations found"
                  description={searching ? 'Try a different search.' : 'Create a new quotation to get started.'}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {workspace && <DraftWorkspace mode={workspace} onClose={() => setWorkspace(null)} />}
      {mergeOpen && <MergeClientsDialog onClose={() => setMergeOpen(false)} />}
      {editingItem && <EditItemDialog quotation={editingItem} onClose={() => setEditingItem(null)} />}
      {editingGroup && (
        <EditGroupDialog
          quoteRef={editingGroup.quoteRef}
          company={editingGroup.company}
          poNumber={editingGroup.poNumber}
          paymentTerm={editingGroup.paymentTerm}
          remarks={editingGroup.remarks}
          onClose={() => setEditingGroup(null)}
        />
      )}
      {printGroup && (
        <FormalQuotePreview
          onClose={() => setPrintGroup(null)}
          company={printGroup.company}
          address={clientAddress(printGroup.company)}
          quoteRef={printGroup.quoteRef}
          date={printGroup.date}
          poNumber={printGroup.poNumber}
          paymentTerm={printGroup.paymentTerm}
          remarks={printGroup.remarks}
          items={printGroup.items.map((q) => ({
            item: q.item ?? '',
            quantity: q.quantity_requested ?? 0,
            nam_unit_price: q.nam_unit_price ?? 0,
          }))}
        />
      )}

      <ConfirmDialog
        open={!!confirmApprove}
        onClose={() => setConfirmApprove(null)}
        title="Approve quotation?"
        description={`This will DEDUCT stock for "${confirmApprove?.item ?? ''}" (×${confirmApprove?.quantity_requested ?? 0}) and mark it Approved.`}
        confirmLabel="Approve & Deduct"
        busy={approve.isPending}
        onConfirm={() => {
          if (!confirmApprove) return
          run(() => approve.mutateAsync(confirmApprove), 'Quotation approved — stock deducted', () => setConfirmApprove(null))
        }}
      />
      <ConfirmDialog
        open={!!confirmFinalize}
        onClose={() => setConfirmFinalize(null)}
        title="Finalize & convert to sale?"
        description={`"${confirmFinalize?.item ?? ''}" (${formatPeso(round2((confirmFinalize?.quantity_requested ?? 0) * (confirmFinalize?.nam_unit_price ?? 0)))}) becomes a sales record dated today${statusOf(confirmFinalize ?? ({} as QuotationRow)) !== 'Approved' ? ' and stock will be DEDUCTED' : ''}.`}
        confirmLabel="Finalize"
        busy={finalize.isPending}
        onConfirm={() => {
          if (!confirmFinalize) return
          run(
            () => finalize.mutateAsync({ row: confirmFinalize, date: toISODate(new Date()) }),
            'Quotation converted to sale',
            () => setConfirmFinalize(null),
          )
        }}
      />
      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title="Remove quotation item?"
        description={`"${confirmRemove?.item ?? ''}" will be removed from ${confirmRemove?.quote_ref ?? 'the group'}${statusOf(confirmRemove ?? ({} as QuotationRow)) === 'Approved' ? ' and its deducted stock restored' : ''}.`}
        confirmLabel="Remove"
        destructive
        busy={removeItem.isPending}
        onConfirm={() => {
          if (!confirmRemove) return
          run(() => removeItem.mutateAsync(confirmRemove), 'Item removed', () => setConfirmRemove(null))
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onClose={() => setConfirmDeleteGroup(null)}
        title={`Delete group ${confirmDeleteGroup?.quoteRef ?? ''}?`}
        description="All non-Converted items in this group will be deleted; stock deducted by Approved items is restored. Converted items are kept."
        confirmLabel="Delete group"
        destructive
        busy={deleteGroup.isPending}
        onConfirm={() => {
          if (!confirmDeleteGroup) return
          run(
            () => deleteGroup.mutateAsync({ quoteRef: confirmDeleteGroup.quoteRef, company: confirmDeleteGroup.company }),
            'Quotation group deleted',
            () => setConfirmDeleteGroup(null),
          )
        }}
      />
    </div>
  )
}
