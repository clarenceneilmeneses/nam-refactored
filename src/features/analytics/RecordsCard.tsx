import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatPeso } from '@/lib/format'
import { pesoCompact } from '../dashboard/charts'
import type { MilestoneStatus, RecordItem } from './analyticsLogic'

/**
 * All-time bests for the current selection, plus (when nothing is filtered)
 * the lifetime-revenue milestone tracker — the "hall of fame" panel.
 */
export function RecordsCard({
  records,
  milestone,
  scoped,
  loading,
  className,
}: {
  records: RecordItem[]
  milestone: MilestoneStatus
  /** True when a year or drill filter narrows the data — hides the lifetime milestone strip. */
  scoped: boolean
  loading: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Records &amp; Milestones</CardTitle>
        <CardDescription>The best marks {scoped ? 'within this selection' : 'in company history'}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : records.length === 0 ? (
          <EmptyState title="No data for this selection" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {records.map((r) => (
                <div key={r.label} className="flex items-start gap-3 rounded-xl border border-hairline p-3.5">
                  <span
                    className="material-symbols-rounded flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[20px] text-accent-strong"
                    aria-hidden
                  >
                    {r.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{r.label}</p>
                    <p className="text-lg leading-tight font-bold tabular-nums text-ink">{r.value}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-secondary" title={r.detail}>
                      {r.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {!scoped && milestone.lifetime > 0 && (
              <div className="mt-4 border-t border-hairline pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    Lifetime revenue: <span className="tabular-nums">{formatPeso(milestone.lifetime)}</span>
                  </p>
                  {milestone.next !== null && (
                    <p className="text-xs tabular-nums text-ink-secondary">
                      Next stop {pesoCompact(milestone.next)} — {milestone.progress.toFixed(0)}% there
                    </p>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${milestone.progress}%` }} />
                </div>
                {milestone.reached && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Passed the {pesoCompact(milestone.reached.threshold)} mark in {monthLabel(milestone.reached.monthKey)}.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[Number(month) - 1] ?? month} ${year}`
}
