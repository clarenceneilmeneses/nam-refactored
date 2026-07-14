import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/format'
import { pesoCompact } from '../dashboard/charts'
import type { Insight, MilestoneStatus, MonthPoint, ReceivablesAging, RecordItem } from './analyticsLogic'

export type ReportData = {
  scope: string
  totals: { revenue: number; profit: number; margin: number; orders: number; avgOrder: number }
  monthly: MonthPoint[]
  insights: Insight[]
  records: RecordItem[]
  milestone: MilestoneStatus
  /** True when a year/drill filter narrows the data — the milestone line is lifetime-only. */
  scoped: boolean
  aging: ReceivablesAging
}

/**
 * Printable executive analytics report. Like FormalQuotePreview, this is a
 * paper document: it prints black-on-white with the NAM letterhead blue, so
 * its colors are deliberately fixed rather than themed (same exemption as
 * the formal quotation). Shares the fq-print-mode / fq-overlay print CSS.
 */
export function ReportPreview({ onClose, data }: { onClose: () => void; data: ReportData }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('fq-print-mode')
    document.body.classList.add('fq-print-mode')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      document.documentElement.classList.remove('fq-print-mode')
      document.body.classList.remove('fq-print-mode')
    }
  }, [onClose])

  const generated = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())

  const last12 = data.monthly.slice(-12)
  const { totals, aging } = data

  return createPortal(
    <div
      className="fq-overlay fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Analytics report preview"
    >
      <div className="mx-auto max-w-[900px]">
        {/* Control strip — never printed */}
        <div className="fq-controls mb-3 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-hairline bg-surface p-3 shadow-lg print:hidden">
          <p className="min-w-48 flex-1 text-xs text-ink-secondary">
            Print-ready executive summary of the current Analytics selection.
          </p>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print Report
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>

        {/* The document */}
        <div id="analytics-report-doc" className="bg-white p-10 text-[12px] leading-relaxed text-black shadow-xl">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-4 border-[#003366] pb-3">
            <div>
              <h1 className="text-lg font-bold tracking-wide text-[#003366]">NAM BUILDERS AND SUPPLY CORP.</h1>
              <p className="text-[11px] text-[#444]">RNA Building, Brgy Santiago, Malvar, Batangas, 4233</p>
            </div>
            <div className="pt-1 text-right">
              <p className="text-xl font-bold tracking-[0.2em] text-[#44546a]">ANALYTICS REPORT</p>
              <p className="mt-0.5 text-[11px] text-[#444]">Generated {generated}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#444]">
            <strong>Scope:</strong> {data.scope}
          </p>

          {/* Headline numbers */}
          <ReportSection title="Summary">
            <div className="grid grid-cols-5 gap-px overflow-hidden rounded border border-[#c9d3de] bg-[#c9d3de]">
              <SummaryCell label="Total Revenue" value={formatPeso(totals.revenue)} />
              <SummaryCell label="Net Profit" value={formatPeso(totals.profit)} />
              <SummaryCell label="Profit Margin" value={`${totals.margin.toFixed(1)}%`} />
              <SummaryCell label="Orders" value={totals.orders.toLocaleString()} />
              <SummaryCell label="Avg. Order Value" value={formatPeso(totals.avgOrder)} />
            </div>
          </ReportSection>

          {/* Plain-language findings */}
          {data.insights.length > 0 && (
            <ReportSection title="Key Findings">
              <ul className="space-y-1.5">
                {data.insights.map((i) => (
                  <li key={i.headline} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#003366]" aria-hidden />
                    <p>
                      <strong>{i.headline}.</strong> {i.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </ReportSection>
          )}

          {/* Records */}
          {data.records.length > 0 && (
            <ReportSection title="Records & Milestones">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                {data.records.map((r) => (
                  <p key={r.label}>
                    <strong>{r.label}:</strong> {r.value} <span className="text-[#444]">({r.detail})</span>
                  </p>
                ))}
              </div>
              {!data.scoped && data.milestone.lifetime > 0 && (
                <p className="mt-2">
                  <strong>Lifetime revenue:</strong> {formatPeso(data.milestone.lifetime)}
                  {data.milestone.next !== null && (
                    <> — {data.milestone.progress.toFixed(0)}% of the way to {pesoCompact(data.milestone.next)}.</>
                  )}
                </p>
              )}
            </ReportSection>
          )}

          {/* Receivables */}
          <ReportSection title="Receivables Aging">
            {aging.totalUnpaid === 0 ? (
              <p>All invoices in this selection have been collected — no outstanding receivables.</p>
            ) : (
              <>
                <p className="mb-2">
                  <strong>{formatPeso(aging.totalUnpaid)}</strong> outstanding across{' '}
                  {aging.invoices.toLocaleString()} unpaid {aging.invoices === 1 ? 'invoice' : 'invoices'}
                  {aging.overdue.invoices > 0 && (
                    <>
                      , of which <strong>{formatPeso(aging.overdue.amount)}</strong> ({aging.overdue.invoices.toLocaleString()}{' '}
                      {aging.overdue.invoices === 1 ? 'invoice' : 'invoices'}) is past its due date
                    </>
                  )}
                  .
                </p>
                <div className="grid grid-cols-2 gap-8">
                  <ReportTable
                    head={['Invoice age', 'Invoices', 'Amount']}
                    rows={aging.buckets.map((b) => [b.label, b.invoices.toLocaleString(), formatPeso(b.amount)])}
                  />
                  <ReportTable
                    head={['Largest balances', 'Oldest', 'Amount']}
                    rows={aging.debtors.map((d) => [d.company, `${d.oldestDays.toLocaleString()}d`, formatPeso(d.amount)])}
                  />
                </div>
              </>
            )}
          </ReportSection>

          {/* Monthly table */}
          {last12.length > 0 && (
            <ReportSection title={`Monthly Performance${data.monthly.length > 12 ? ' (last 12 months)' : ''}`}>
              <ReportTable
                head={['Month', 'Revenue', 'Profit', 'Margin', 'Orders']}
                rows={last12.map((p) => [
                  p.label,
                  formatPeso(p.revenue),
                  formatPeso(p.profit),
                  `${p.margin.toFixed(1)}%`,
                  p.orders.toLocaleString(),
                ])}
              />
            </ReportSection>
          )}

          <p className="mt-6 border-t border-[#c9d3de] pt-2 text-[10px] text-[#666]">
            Generated from the NAM Dashboard · Figures reflect the filters applied on the Analytics page at the time of
            printing.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-[#c9d3de] pb-1 text-[13px] font-bold tracking-wide text-[#003366] uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-2.5">
      <p className="text-[10px] font-medium tracking-wide text-[#666] uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold tabular-nums">{value}</p>
    </div>
  )
}

function ReportTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              className={`border-b-2 border-[#003366] py-1 font-bold ${i === 0 ? 'text-left' : 'text-right'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, ri) => (
          <tr key={ri}>
            {cells.map((c, ci) => (
              <td
                key={ci}
                className={`border-b border-[#e2e8f0] py-1 ${ci === 0 ? 'text-left' : 'text-right tabular-nums'}`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
