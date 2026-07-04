import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  Bookmark,
  Building2,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSignature,
  Merge,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Stamp,
  Trash2,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type RefGroup = {
  quoteRef: string
  company: string | null
  date: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  items: QuotationRow[]
  actionCount: number
}

type CompanyGroup = {
  company: string
  refs: RefGroup[]
  actionCount: number
  itemCount: number
}

type Segment = 'all' | 'action' | 'converted'

function statusOf(q: QuotationRow): string {
  return q.status ?? 'Pending'
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case 'Approved':
      return <Badge variant="accent">Approved</Badge>
    case 'Reserved':
      return <Badge variant="critical">Reserved</Badge>
    case 'Converted':
      return <Badge variant="good">Converted</Badge>
    default:
      return <Badge variant="neutral">{status}</Badge>
  }
}

function longDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMMM d, yyyy')
  } catch {
    return iso
  }
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [workspace, setWorkspace] = useState<WorkspaceMode | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<QuotationRow | null>(null)
  const [editingGroup, setEditingGroup] = useState<RefGroup | null>(null)
  const [printGroup, setPrintGroup] = useState<RefGroup | null>(null)
  const [confirmApprove, setConfirmApprove] = useState<QuotationRow | null>(null)
  const [confirmFinalize, setConfirmFinalize] = useState<QuotationRow | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<QuotationRow | null>(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<RefGroup | null>(null)

  // Whole-table status stats for the cards.
  const stats = useMemo(() => {
    const sums = {
      Pending: { count: 0, amount: 0 },
      Approved: { count: 0, amount: 0 },
      Reserved: { count: 0, amount: 0 },
      Converted: { count: 0, amount: 0 },
    }
    for (const q of quotations ?? []) {
      const s = statusOf(q)
      const bucket = s in sums ? sums[s as keyof typeof sums] : sums.Pending
      bucket.count += 1
      bucket.amount += q.total_amount ?? 0
    }
    return sums
  }, [quotations])

  // Company → quote_ref accordion groups (rows come date desc, id desc).
  const groups = useMemo<CompanyGroup[]>(() => {
    const companies = new Map<string, Map<string, RefGroup>>()
    for (const q of quotations ?? []) {
      const companyKey = q.company?.trim() || '(No company)'
      const refKey = q.quote_ref?.trim() || `(no ref) #${q.id}`
      let refs = companies.get(companyKey)
      if (!refs) {
        refs = new Map()
        companies.set(companyKey, refs)
      }
      let group = refs.get(refKey)
      if (!group) {
        group = {
          quoteRef: refKey,
          company: q.company,
          date: q.date,
          poNumber: q.po_number,
          paymentTerm: q.payment_term,
          remarks: q.remarks,
          items: [],
          actionCount: 0,
        }
        refs.set(refKey, group)
      }
      group.items.push(q)
      if (statusOf(q) !== 'Converted') group.actionCount += 1
    }
    return [...companies.entries()].map(([company, refs]) => {
      const refList = [...refs.values()]
      return {
        company,
        refs: refList,
        actionCount: refList.reduce((n, r) => n + r.actionCount, 0),
        itemCount: refList.reduce((n, r) => n + r.items.length, 0),
      }
    })
  }, [quotations])

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: CompanyGroup[] = []
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
      result.push({
        company: group.company,
        refs,
        actionCount: refs.reduce((n, r) => n + r.actionCount, 0),
        itemCount: refs.reduce((n, r) => n + r.items.length, 0),
      })
    }
    return result
  }, [groups, search, segment])

  const searching = search.trim() !== ''

  function toggleCompany(company: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(company)) next.delete(company)
      else next.add(company)
      return next
    })
  }

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

  if (error) return <p className="text-sm text-critical">Couldn’t load quotations: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Quotations</h1>
          <p className="text-xs text-ink-muted">{(quotations ?? []).length.toLocaleString()} quotation lines across {groups.length} clients</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-[#fab219] text-[#3a2b00] hover:bg-[#e0a017]" onClick={() => setMergeOpen(true)}>
            <Merge className="h-3.5 w-3.5" /> Merge Duplicate Clients
          </Button>
          <Button size="sm" onClick={() => setWorkspace({ kind: 'create' })}>
            <Plus className="h-3.5 w-3.5" /> Create New Quotation
          </Button>
        </div>
      </div>

      {/* Status stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Clock className="h-4 w-4 text-[#b47d00]" />} iconBg="bg-[#fab219]/15" label="Pending Review" count={stats.Pending.count} amount={stats.Pending.amount} />
        <StatCard icon={<FileSignature className="h-4 w-4 text-accent" />} iconBg="bg-accent-soft" label="Approved & Ready" count={stats.Approved.count} amount={stats.Approved.amount} />
        <StatCard icon={<Bookmark className="h-4 w-4 text-critical" />} iconBg="bg-[#d03b3b]/10" label="Reserved Stock" count={stats.Reserved.count} amount={stats.Reserved.amount} />
        <StatCard
          icon={<CheckCheck className="h-4 w-4 text-good-text" />}
          iconBg="bg-[#0ca30c]/10"
          label="Converted to Sales"
          count={stats.Converted.count}
          amount={stats.Converted.amount}
          className="border-l-4 border-l-good"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input className="w-72 pl-8" placeholder="Search companies, refs or items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex overflow-hidden rounded-md border border-hairline">
          {(
            [
              ['all', 'All Quotes'],
              ['action', 'Action Needed'],
              ['converted', 'Converted'],
            ] as Array<[Segment, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                'px-3 py-1.5 text-xs font-medium cursor-pointer',
                segment === value ? 'bg-accent text-white' : 'bg-surface text-ink-secondary hover:bg-page',
              )}
              onClick={() => setSegment(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped accordion */}
      {isLoading ? (
        <TableSkeleton />
      ) : visibleGroups.length === 0 ? (
        <EmptyState title="No quotations found" description={searching ? 'Try a different search.' : 'Create a new quotation to get started.'} />
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const isOpen = searching || expanded.has(group.company)
            return (
              <div key={group.company} className="overflow-hidden rounded-lg border border-hairline bg-surface">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-page cursor-pointer"
                  onClick={() => toggleCompany(group.company)}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />}
                  <Building2 className="h-4 w-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.company}</span>
                  {group.actionCount > 0 && <Badge variant="warning">{group.actionCount} Action Required</Badge>}
                  <Badge variant="neutral">{group.itemCount} Items Total</Badge>
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-hairline p-3">
                    {group.refs.map((ref) => (
                      <div key={ref.quoteRef} className="rounded-md border border-hairline">
                        <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-page px-3 py-2">
                          <span className="text-sm font-semibold text-accent">Ref: {ref.quoteRef}</span>
                          <Badge variant="neutral">
                            <CalendarDays className="h-3 w-3" /> {longDate(ref.date)}
                          </Badge>
                          {ref.poNumber && <Badge variant="neutral">Inquiry #: {ref.poNumber}</Badge>}
                          <span className="flex-1" />
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() =>
                              setWorkspace({
                                kind: 'addItem',
                                group: {
                                  company: ref.company,
                                  quoteRef: ref.quoteRef,
                                  poNumber: ref.poNumber,
                                  paymentTerm: ref.paymentTerm,
                                  remarks: ref.remarks,
                                },
                              })
                            }
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Item
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingGroup(ref)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit Group
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setPrintGroup(ref)}>
                            <Printer className="h-3.5 w-3.5" /> Print Formal Quote
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Delete group"
                            aria-label={`Delete group ${ref.quoteRef}`}
                            onClick={() => setConfirmDeleteGroup(ref)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-critical" />
                          </Button>
                        </div>

                        <ul className="divide-y divide-hairline">
                          {ref.items.map((q) => {
                            const status = statusOf(q)
                            const converted = status === 'Converted'
                            return (
                              <li key={q.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', converted && 'opacity-50')}>
                                <span className="min-w-0 flex-1 truncate text-sm" title={q.item ?? ''}>
                                  {q.item || '—'}
                                </span>
                                <span className="text-xs text-ink-muted tabular-nums">×{q.quantity_requested ?? 0}</span>
                                <span className="text-xs text-ink-secondary tabular-nums whitespace-nowrap">
                                  {formatPeso(q.nam_unit_price)} / <strong>{formatPeso(q.total_amount)}</strong>
                                </span>
                                <StatusPill status={status} />
                                <span className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Buy Again — new quote with this item"
                                    aria-label="Buy again"
                                    onClick={() =>
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
                                      })
                                    }
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                  {!converted && (
                                    <>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit item" aria-label="Edit item" onClick={() => setEditingItem(q)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      {(status === 'Pending' || status === 'Reserved') && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className={cn('h-7 w-7', status === 'Reserved' && 'bg-critical text-white hover:bg-[#b32f2f] hover:text-white')}
                                          title={status === 'Reserved' ? 'Release reservation' : 'Reserve stock'}
                                          aria-label="Toggle reservation"
                                          disabled={toggleReserve.isPending}
                                          onClick={() =>
                                            run(
                                              () => toggleReserve.mutateAsync(q),
                                              status === 'Reserved' ? 'Reservation released' : 'Stock reserved',
                                            )
                                          }
                                        >
                                          <Bookmark className={cn('h-3.5 w-3.5', status === 'Reserved' && 'fill-current')} />
                                        </Button>
                                      )}
                                      {(status === 'Pending' || status === 'Reserved') && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          title="Approve — deducts stock"
                                          aria-label="Approve"
                                          onClick={() => setConfirmApprove(q)}
                                        >
                                          <Stamp className="h-3.5 w-3.5 text-accent" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Finalize — convert to sale"
                                        aria-label="Finalize"
                                        onClick={() => setConfirmFinalize(q)}
                                      >
                                        <CheckCheck className="h-3.5 w-3.5 text-good-text" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Remove item"
                                        aria-label="Remove item"
                                        onClick={() => setConfirmRemove(q)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-critical" />
                                      </Button>
                                    </>
                                  )}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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

function StatCard({
  icon,
  iconBg,
  label,
  count,
  amount,
  className,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  count: number
  amount: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-hairline bg-surface p-3', className)}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconBg)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-muted">{label}</p>
        <p className="text-lg leading-tight font-semibold tabular-nums">{count.toLocaleString()}</p>
        <p className="truncate text-xs text-ink-secondary tabular-nums">{formatPeso(amount)}</p>
      </div>
    </div>
  )
}
