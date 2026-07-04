import { useEffect, useState } from 'react'
import { ArrowLeft, Building2, MapPin, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/format'
import { RefCard } from './RefCard'
import type { CompanyGroup, QuotationActions } from './quotationModel'

type ClientDetailProps = {
  group: CompanyGroup
  address: string | null
  searching: boolean
  actions: QuotationActions
  onNewQuote: (company: string) => void
  onBack: () => void
}

export function ClientDetail({ group, address, searching, actions, onNewQuote, onBack }: ClientDetailProps) {
  // Expanded refs, seeded with the newest ref whenever the client changes.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => {
    const first = group.refs[0]?.quoteRef
    setExpanded(new Set(first ? [first] : []))
  }, [group.company, group.refs])

  function toggle(quoteRef: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(quoteRef)) next.delete(quoteRef)
      else next.add(quoteRef)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-surface">
      <div className="flex flex-wrap items-start gap-3 border-b border-hairline p-4">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 shrink-0 rounded-md p-1 text-ink-muted hover:bg-page lg:hidden cursor-pointer"
          aria-label="Back to client list"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Building2 className="mt-0.5 hidden h-5 w-5 shrink-0 text-accent lg:block" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold" title={group.company}>
            {group.company}
          </h2>
          {address && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
              <MapPin className="h-3 w-3 shrink-0" /> {address}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted tabular-nums">
            <span>{group.refCount} refs</span>
            <span>·</span>
            <span>{group.itemCount} items</span>
            <span>·</span>
            <span className="font-medium text-ink-secondary">{formatPeso(group.openValue)} open</span>
            {group.staleActionCount > 0 && (
              <Badge variant="warning" title="Open items older than 90 days">
                {group.staleActionCount} stale
              </Badge>
            )}
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => onNewQuote(group.company)}>
          <Plus className="h-3.5 w-3.5" /> New Quote
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {group.refs.map((ref) => (
          <RefCard key={ref.quoteRef} group={ref} open={searching || expanded.has(ref.quoteRef)} onToggle={() => toggle(ref.quoteRef)} actions={actions} />
        ))}
      </div>
    </div>
  )
}
