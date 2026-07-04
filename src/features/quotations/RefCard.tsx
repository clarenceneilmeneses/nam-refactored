import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Bookmark,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Stamp,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPeso } from '@/lib/format'
import type { QuotationRow } from '@/types/database'
import { relativeAge, staleLabel, statusOf, type QuotationActions, type RefGroup } from './quotationModel'

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
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return iso
  }
}

type RefCardProps = {
  group: RefGroup
  open: boolean
  onToggle: () => void
  actions: QuotationActions
}

export function RefCard({ group, open, onToggle, actions }: RefCardProps) {
  const total = useMemo(() => group.items.reduce((n, q) => n + (q.total_amount ?? 0), 0), [group.items])

  // Status breakdown for the collapsed summary, in a stable display order.
  const summary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const q of group.items) counts.set(statusOf(q), (counts.get(statusOf(q)) ?? 0) + 1)
    const order = ['Pending', 'Reserved', 'Approved', 'Converted']
    return [...counts.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([status, n]) => `${n} ${status}`)
      .join(' · ')
  }, [group.items])

  // Age of the oldest still-open item — what the stale chip actually measures.
  const oldestOpenDate = useMemo(() => {
    let oldest = ''
    for (const q of group.items) {
      if (statusOf(q) === 'Converted') continue
      if (oldest === '' || q.date < oldest) oldest = q.date
    }
    return oldest
  }, [group.items])

  const isStale = group.staleCount > 0

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-page cursor-pointer"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
        )}
        <span className="shrink-0 text-sm font-semibold text-accent">{group.quoteRef}</span>
        <span className="hidden text-xs text-ink-muted sm:inline">{longDate(group.date)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          <span className="text-ink-secondary">{group.items.length} items</span>
          {summary && <span className="hidden md:inline"> · {summary}</span>}
        </span>
        {isStale ? (
          <Badge variant="warning" title={`${group.staleCount} pending item(s) over 90 days old`}>
            <Clock className="h-3 w-3" /> Stale · {staleLabel(oldestOpenDate || group.date)}
          </Badge>
        ) : (
          <Badge variant="neutral">{relativeAge(group.date)}</Badge>
        )}
        <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">{formatPeso(total)}</span>
      </button>

      {open && (
        <div className="border-t border-hairline">
          <div className="flex flex-wrap items-center gap-2 bg-page px-3 py-2">
            {group.poNumber && <Badge variant="neutral">Inquiry #: {group.poNumber}</Badge>}
            {group.paymentTerm && <Badge variant="neutral">{group.paymentTerm}</Badge>}
            <span className="flex-1" />
            <Button variant="subtle" size="sm" onClick={() => actions.onAddItem(group)}>
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
            <Button variant="outline" size="sm" onClick={() => actions.onEditGroup(group)}>
              <Pencil className="h-3.5 w-3.5" /> Edit Group
            </Button>
            <Button variant="outline" size="sm" onClick={() => actions.onPrintGroup(group)}>
              <Printer className="h-3.5 w-3.5" /> Print Formal Quote
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Delete group"
              aria-label={`Delete group ${group.quoteRef}`}
              onClick={() => actions.onDeleteGroup(group)}
            >
              <Trash2 className="h-3.5 w-3.5 text-critical" />
            </Button>
          </div>

          <ul className="divide-y divide-hairline">
            {group.items.map((q) => (
              <ItemRow key={q.id} q={q} actions={actions} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ItemRow({ q, actions }: { q: QuotationRow; actions: QuotationActions }) {
  const status = statusOf(q)
  const converted = status === 'Converted'
  return (
    <li className={cn('group/item flex flex-wrap items-center gap-2 px-3 py-2', converted && 'opacity-50')}>
      <span className="min-w-0 flex-1 truncate text-sm" title={q.item ?? ''}>
        {q.item || '—'}
      </span>
      <span className="text-xs text-ink-muted tabular-nums">×{q.quantity_requested ?? 0}</span>
      <span className="text-xs text-ink-secondary tabular-nums whitespace-nowrap">
        {formatPeso(q.nam_unit_price)} / <strong>{formatPeso(q.total_amount)}</strong>
      </span>
      <StatusPill status={status} />
      <span
        className={cn(
          'flex items-center gap-0.5',
          actions.revealOnHover &&
            'lg:opacity-0 lg:transition-opacity lg:duration-150 lg:group-hover/item:opacity-100 lg:group-focus-within/item:opacity-100',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Buy Again — new quote with this item"
          aria-label="Buy again"
          onClick={() => actions.onBuyAgain(q)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        {!converted && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Edit item"
              aria-label="Edit item"
              onClick={() => actions.onEditItem(q)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {(status === 'Pending' || status === 'Reserved') && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', status === 'Reserved' && 'bg-critical text-white hover:bg-[#b32f2f] hover:text-white')}
                title={status === 'Reserved' ? 'Release reservation' : 'Reserve stock'}
                aria-label="Toggle reservation"
                disabled={actions.reserveBusy}
                onClick={() => actions.onToggleReserve(q)}
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
                onClick={() => actions.onApprove(q)}
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
              onClick={() => actions.onFinalize(q)}
            >
              <CheckCheck className="h-3.5 w-3.5 text-good-text" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Remove item"
              aria-label="Remove item"
              onClick={() => actions.onRemove(q)}
            >
              <Trash2 className="h-3.5 w-3.5 text-critical" />
            </Button>
          </>
        )}
      </span>
    </li>
  )
}
