import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPeso } from '@/lib/format'
import type { InsightTone, ReceivablesAging } from './analyticsLogic'

/** Bar fill per aging tone — status colors carry real status meaning here. */
const BAR_TONE: Record<InsightTone, string> = {
  neutral: 'bg-accent',
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-critical',
}

/**
 * Who still owes money and for how long: unpaid revenue bucketed by invoice
 * age, plus the largest outstanding balances to chase first.
 */
export function ReceivablesCard({
  aging,
  loading,
  className,
}: {
  aging: ReceivablesAging
  loading: boolean
  className?: string
}) {
  const allClear = !loading && aging.totalUnpaid === 0
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>Receivables Aging</CardTitle>
          <CardDescription>Unpaid invoices in this selection, aged from sale date to today</CardDescription>
        </div>
        {!loading && aging.totalUnpaid > 0 && (
          <span className="inline-flex items-center rounded bg-critical/15 px-1.5 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap text-critical-text">
            {formatPeso(aging.totalUnpaid)} outstanding
          </span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : allClear ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="material-symbols-rounded flex h-11 w-11 items-center justify-center rounded-full bg-good/15 text-[24px] text-good-text" aria-hidden>
              task_alt
            </span>
            <p className="text-sm font-semibold text-ink">All collected</p>
            <p className="text-xs text-ink-secondary">Every invoice in this selection has been paid.</p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">By invoice age</p>
              <div className="mt-2 space-y-3">
                {aging.buckets.map((b) => (
                  <div key={b.label}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-ink">
                        {b.label}
                        <span className="ml-1.5 font-normal text-ink-muted">
                          {b.invoices.toLocaleString()} {b.invoices === 1 ? 'invoice' : 'invoices'}
                        </span>
                      </span>
                      <span className="tabular-nums text-ink-secondary">{formatPeso(b.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={`h-full rounded-full ${BAR_TONE[b.tone]}`}
                        style={{ width: `${b.amount > 0 ? Math.max(b.share, 2) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {aging.overdue.invoices > 0 && (
                <p className="mt-3 text-xs font-medium text-critical-text">
                  {formatPeso(aging.overdue.amount)} across {aging.overdue.invoices.toLocaleString()}{' '}
                  {aging.overdue.invoices === 1 ? 'invoice is' : 'invoices are'} already past the due date.
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">Largest outstanding balances</p>
              <ol className="mt-2 divide-y divide-hairline">
                {aging.debtors.map((d) => (
                  <li key={d.company} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{d.company}</p>
                      <p className="text-[11px] text-ink-muted">
                        {d.invoices.toLocaleString()} {d.invoices === 1 ? 'invoice' : 'invoices'} · oldest{' '}
                        {d.oldestDays.toLocaleString()} {d.oldestDays === 1 ? 'day' : 'days'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-ink">{formatPeso(d.amount)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
