import { useRef } from 'react'
import { Merge, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatPeso } from '@/lib/format'
import { relativeAge, type CompanyGroup, type Segment, type SortMode } from './quotationModel'

type ClientRailProps = {
  groups: CompanyGroup[]
  selected: string | null
  onSelect: (company: string) => void
  search: string
  onSearch: (v: string) => void
  segment: Segment
  onSegment: (s: Segment) => void
  sort: SortMode
  onSort: (s: SortMode) => void
  searching: boolean
  onMerge: () => void
}

const SEGMENTS: Array<[Segment, string]> = [
  ['all', 'All'],
  ['action', 'Action Needed'],
  ['converted', 'Converted'],
]

export function ClientRail({
  groups,
  selected,
  onSelect,
  search,
  onSearch,
  segment,
  onSegment,
  sort,
  onSort,
  searching,
  onMerge,
}: ClientRailProps) {
  const listRef = useRef<HTMLDivElement>(null)

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const idx = groups.findIndex((g) => g.company === selected)
    const next = e.key === 'ArrowDown' ? Math.min(groups.length - 1, idx + 1) : Math.max(0, idx - 1)
    const target = groups[next]
    if (target) {
      onSelect(target.company)
      listRef.current?.querySelector<HTMLElement>(`[data-company="${CSS.escape(target.company)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-surface">
      <div className="space-y-2 border-b border-hairline p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input
            className="w-full pl-8"
            placeholder="Search companies, refs or items…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-md border border-hairline">
            {SEGMENTS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium cursor-pointer',
                  segment === value ? 'bg-accent text-white' : 'bg-surface text-ink-secondary hover:bg-page',
                )}
                onClick={() => onSegment(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortMode)}
            className="h-7 rounded-md border border-hairline bg-surface px-1.5 text-[11px] text-ink-secondary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Sort clients"
          >
            <option value="recent">Recent activity</option>
            <option value="name">Name A–Z</option>
            <option value="value">Open value</option>
          </select>
        </div>
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Clients"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
      >
        {groups.length === 0 ? (
          <p className="p-4 text-xs text-ink-muted">No clients match.</p>
        ) : (
          groups.map((g) => {
            const active = g.company === selected
            return (
              <button
                key={g.company}
                type="button"
                role="option"
                aria-selected={active}
                data-company={g.company}
                onClick={() => onSelect(g.company)}
                className={cn(
                  'flex w-full items-center gap-2 border-l-2 px-3 py-2.5 text-left cursor-pointer',
                  active ? 'border-l-accent bg-accent-soft/50' : 'border-l-transparent hover:bg-page',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', active ? 'font-semibold text-ink' : 'font-medium text-ink')} title={g.company}>
                    {g.company}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted tabular-nums">
                    {searching
                      ? `${g.refCount} ref${g.refCount === 1 ? '' : 's'} match`
                      : `${relativeAge(g.latestDate)} · ${formatPeso(g.openValue)} open`}
                  </p>
                </div>
                {g.freshActionCount > 0 ? (
                  <Badge variant="warning" title={`${g.freshActionCount} open item(s) needing attention`}>
                    {g.freshActionCount}
                  </Badge>
                ) : g.staleActionCount > 0 ? (
                  <Badge variant="neutral" title={`${g.staleActionCount} stale pending item(s)`}>
                    dormant
                  </Badge>
                ) : null}
              </button>
            )
          })
        )}
      </div>

      <div className="border-t border-hairline p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-warning-text"
          onClick={onMerge}
          title="Merge duplicate client names"
        >
          <Merge className="h-3.5 w-3.5" /> Merge Duplicate Clients
        </Button>
      </div>
    </div>
  )
}
