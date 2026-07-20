import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, DatabaseBackup, FileCode2, Info, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatPeso } from '@/lib/format'
import type { LegacyRestoreSummary } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TypeToConfirmDialog } from './DataManagementTab'
import { LEGACY_TABLES, parseLegacyDump, type LegacyDump, type LegacyTableName } from './legacyDump'

const BATCH_SIZE = 500

const TABLE_LABELS: Record<LegacyTableName, string> = {
  products: 'Products',
  clients: 'Clients',
  company_assignments: 'Company Assignments',
  quotations: 'Quotations',
  sales: 'Sales Records',
  system_logs: 'System Logs',
}

/** Off by default: replacing it erases the audit trail written by THIS system. */
const DEFAULT_UNCHECKED: ReadonlySet<LegacyTableName> = new Set(['system_logs'])

type MonthCheck = { month: string; dumpRows: number; dumpNam: number; liveRows: number; liveNam: number }

type Preview = {
  dump: LegacyDump
  fileName: string
  liveCounts: Partial<Record<LegacyTableName, number>>
  monthChecks: MonthCheck[]
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

export function LegacyRestoreTab() {
  const queryClient = useQueryClient()
  const [dragActive, setDragActive] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<LegacyTableName>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [summary, setSummary] = useState<LegacyRestoreSummary | null>(null)

  async function onFile(file: File) {
    setLoadingFile(true)
    try {
      const dump = parseLegacyDump(await file.text())
      const present = LEGACY_TABLES.filter((t) => dump.tables[t])

      // Live row counts per table, for the dump-vs-dashboard diff.
      const liveCounts: Partial<Record<LegacyTableName, number>> = {}
      await Promise.all(
        present.map(async (t) => {
          const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
          if (error) throw new Error(`Could not count live ${t}: ${error.message}`)
          liveCounts[t] = count ?? 0
        }),
      )

      // Revenue sync check on the two most recent months in the dump.
      const months = [...dump.salesByMonth.keys()].sort().slice(-2).reverse()
      const monthChecks: MonthCheck[] = await Promise.all(
        months.map(async (month) => {
          const [y, m] = month.split('-').map(Number)
          const start = `${month}-01`
          const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
          const { data, error } = await supabase
            .from('sales')
            .select('total_nam_amount')
            .gte('date', start)
            .lt('date', end)
          if (error) throw new Error(`Could not read live sales for ${month}: ${error.message}`)
          const liveNam = Math.round((data ?? []).reduce((s, r) => s + (r.total_nam_amount ?? 0), 0) * 100) / 100
          const d = dump.salesByMonth.get(month)!
          return { month, dumpRows: d.rows, dumpNam: d.totalNam, liveRows: (data ?? []).length, liveNam }
        }),
      )

      setPreview({ dump, fileName: file.name, liveCounts, monthChecks })
      setSelected(new Set(present.filter((t) => !DEFAULT_UNCHECKED.has(t))))
      setSummary(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoadingFile(false)
    }
  }

  function acceptDropped(file: File | undefined) {
    if (!file) return
    if (!/\.sql$/i.test(file.name)) {
      toast.error('Please choose the .sql dump exported from phpMyAdmin')
      return
    }
    onFile(file)
  }

  async function runRestore() {
    if (!preview || selected.size === 0) return
    setBusy(true)
    setConfirmOpen(false)
    const tables = LEGACY_TABLES.filter((t) => selected.has(t))
    const totalBatches = tables.reduce(
      (n, t) => n + Math.ceil(preview.dump.tables[t]!.rows.length / BATCH_SIZE),
      0,
    )
    try {
      const { error: beginError } = await supabase.rpc('legacy_restore_begin')
      if (beginError) throw new Error(beginError.message)

      let done = 0
      for (const table of tables) {
        const { columns, rows } = preview.dump.tables[table]!
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          setProgress({ done, total: totalBatches, label: TABLE_LABELS[table] })
          const { error } = await supabase.rpc('legacy_restore_stage', {
            p_table: table,
            p_columns: columns,
            p_rows: rows.slice(i, i + BATCH_SIZE),
          })
          if (error) throw new Error(`Uploading ${table}: ${error.message}`)
          done++
        }
      }

      setProgress({ done: totalBatches, total: totalBatches, label: 'Applying…' })
      const { data, error } = await supabase.rpc('legacy_restore_commit', { p_tables: tables })
      if (error) throw new Error(error.message)
      setSummary(data as LegacyRestoreSummary)
      // Everything on screen may have changed.
      queryClient.invalidateQueries()
      toast.success('Restore complete — the dashboard now matches the dump.')
    } catch (e) {
      // Nothing was replaced unless commit succeeded; staging is cleared on the next run.
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function reset() {
    setPreview(null)
    setSummary(null)
    setSelected(new Set())
  }

  const selectedRows = preview
    ? LEGACY_TABLES.filter((t) => selected.has(t)).reduce((n, t) => n + (preview.dump.tables[t]?.rows.length ?? 0), 0)
    : 0

  if (summary && preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-good" /> Restore complete
          </CardTitle>
          <CardDescription>The dashboard now holds exactly what {preview.fileName} contains.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            {Object.entries(summary.tables).map(([table, count]) => (
              <li key={table} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-good" />
                {TABLE_LABELS[table as LegacyTableName] ?? table}: {count.toLocaleString()} rows loaded
              </li>
            ))}
            {summary.si_review_preserved > 0 && (
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-good" />
                SI reviews kept on {summary.si_review_preserved.toLocaleString()} matching records
              </li>
            )}
            {summary.si_paid_grandfathered > 0 && (
              <li className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-ink-muted" />
                {summary.si_paid_grandfathered.toLocaleString()} Paid records counted as reviewed (closed business)
              </li>
            )}
          </ul>
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="h-4 w-4" /> Restore another dump
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {!preview && (
        <Card>
          <CardHeader>
            <CardTitle>Restore from the old system</CardTitle>
            <CardDescription>
              In phpMyAdmin on Hostinger, export the <code>u476854436_nam</code> database (Quick, format SQL) and
              drop the file here. The whole file is checked and previewed first — nothing changes until you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
                dragActive ? 'border-accent bg-accent-soft/30' : 'border-baseline hover:border-accent hover:bg-accent-soft/20',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setDragActive(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                acceptDropped(e.dataTransfer.files?.[0])
              }}
            >
              <FileCode2 className={cn('h-6 w-6', dragActive ? 'text-accent' : 'text-ink-muted')} />
              <span className="text-sm font-medium">
                {loadingFile ? 'Reading dump…' : dragActive ? 'Drop to check' : 'Click to choose the .sql dump'}
              </span>
              <span className="text-xs text-ink-muted">or drop it here</span>
              <input
                type="file"
                accept=".sql,application/sql,text/plain"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && acceptDropped(e.target.files[0])}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sync check — dump vs. dashboard</CardTitle>
              <CardDescription>
                <FileCode2 className="mr-1 inline h-3.5 w-3.5" />
                {preview.fileName} — compare before replacing anything. “Differs” is expected when the old system has
                newer entries; that difference is exactly what the restore brings over.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.monthChecks.map((c) => {
                const match = c.dumpRows === c.liveRows && Math.abs(c.dumpNam - c.liveNam) < 0.005
                return (
                  <div
                    key={c.month}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{monthLabel(c.month)}</span>
                    <span className="text-xs text-ink-secondary tabular-nums">
                      Dump: {c.dumpRows.toLocaleString()} rows · {formatPeso(c.dumpNam)}
                      <span className="mx-2 text-ink-muted">|</span>
                      Dashboard: {c.liveRows.toLocaleString()} rows · {formatPeso(c.liveNam)}
                    </span>
                    <Badge variant={match ? 'good' : 'warning'}>
                      {match ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {match ? 'In sync' : 'Differs'}
                    </Badge>
                  </div>
                )
              })}
              {preview.monthChecks.length === 0 && (
                <p className="text-xs text-ink-muted">The dump has no sales rows to compare.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What gets replaced</CardTitle>
              <CardDescription>
                Checked tables are wiped and reloaded from the dump in one atomic step — either everything lands or
                nothing changes. Logins, roles and special privileges are never touched, and SI reviews done here are
                kept on records that still match.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto rounded-md border border-hairline">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-page/60 text-left text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                      <th className="px-3 py-1.5">Replace</th>
                      <th className="px-3 py-1.5">Table</th>
                      <th className="px-3 py-1.5 text-right">In dump</th>
                      <th className="px-3 py-1.5 text-right">On dashboard</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEGACY_TABLES.filter((t) => preview.dump.tables[t]).map((t) => (
                      <tr key={t} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-(--color-accent)"
                            checked={selected.has(t)}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(t)
                                else next.delete(t)
                                return next
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          {TABLE_LABELS[t]}
                          {t === 'system_logs' && (
                            <span className="ml-2 text-[11px] text-ink-muted">
                              off = keep the logs this system has written
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {preview.dump.tables[t]!.rows.length.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {(preview.liveCounts[t] ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.dump.dateFixes.length > 0 && (
                <details className="rounded-md border border-hairline p-2 text-xs text-ink-secondary">
                  <summary className="cursor-pointer font-medium">
                    {preview.dump.dateFixes.length} typo date{preview.dump.dateFixes.length === 1 ? '' : 's'} repaired
                    automatically
                  </summary>
                  <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-mono">
                    {preview.dump.dateFixes.map((f, i) => (
                      <p key={i}>{f}</p>
                    ))}
                  </div>
                </details>
              )}

              {progress && (
                <div className="space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-muted">
                    Uploading {progress.label} — batch {Math.min(progress.done + 1, progress.total)} of {progress.total}
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Start over
                </Button>
                <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={busy || selected.size === 0}>
                  <DatabaseBackup className="h-4 w-4" />
                  {busy ? 'Restoring…' : `Replace ${selected.size} table${selected.size === 1 ? '' : 's'} (${selectedRows.toLocaleString()} rows)…`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <TypeToConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={runRestore}
        busy={busy}
        title="Replace dashboard data with the dump?"
        description="The checked tables will be wiped and reloaded from the old system's dump. This cannot be undone."
        phrase="REPLACE"
        confirmLabel="Replace with dump data"
      />
    </div>
  )
}
