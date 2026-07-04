import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Info, Tags, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { useProducts, PRODUCTS_KEY } from '@/hooks/useProducts'
import { SALES_KEY } from '@/hooks/useSales'
import { computeProductMargin } from '@/lib/calculations'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select } from '@/components/ui/select'
import { DataManagementTab } from './DataManagementTab'
import {
  buildPriceUpdates,
  buildSalesRows,
  prepareCsv,
  PRICE_FIELDS,
  SALES_FIELDS,
  type Mapping,
  type ParsedCsv,
  type RowIssue,
} from './importLogic'

type Tab = 'sales' | 'prices' | 'data'

const PREVIEW_ROWS = 20

export function ImportPage() {
  const [tab, setTab] = useState<Tab>('sales')
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="CSV Import & Data Management"
        subtitle="Super Admin only — import legacy sales exports and price lists, or manage bulk data."
      />
      <div className="flex w-fit gap-1 rounded-lg border border-hairline bg-surface p-1">
        {(
          [
            { id: 'sales', label: 'Import Sales', icon: Upload },
            { id: 'prices', label: 'Import Prices', icon: Tags },
            { id: 'data', label: 'Data Management', icon: Database },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer',
              tab === t.id
                ? t.id === 'data'
                  ? 'bg-critical/10 text-critical'
                  : 'bg-accent-soft/70 text-accent-strong'
                : 'text-ink-secondary hover:bg-ink/5',
              tab !== t.id && t.id === 'data' && 'text-critical/80 hover:text-critical',
            )}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'sales' && <CsvImportTab key="sales" kind="sales" />}
      {tab === 'prices' && <CsvImportTab key="prices" kind="prices" />}
      {tab === 'data' && <DataManagementTab />}
    </div>
  )
}

type Step = 'upload' | 'map' | 'done'

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Map & validate' },
  { id: 'done', label: 'Done' },
]

function Stepper({ step }: { step: Step }) {
  const currentIdx = STEP_LABELS.findIndex((s) => s.id === step)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEP_LABELS.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo'
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                state === 'done'
                  ? 'bg-good text-white'
                  : state === 'current'
                    ? 'bg-accent text-white'
                    : 'bg-ink/5 text-ink-muted',
              )}
            >
              {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs font-medium', state === 'todo' ? 'text-ink-muted' : 'text-ink')}>{s.label}</span>
            {i < STEP_LABELS.length - 1 && <span className={cn('mx-1.5 h-px w-6', i < currentIdx ? 'bg-good' : 'bg-hairline')} />}
          </div>
        )
      })}
    </div>
  )
}

function CsvImportTab({ kind }: { kind: 'sales' | 'prices' }) {
  const [step, setStep] = useState<Step>('upload')
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Mapping>({})
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [result, setResult] = useState<string[]>([])
  const { data: products } = useProducts()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const fields = kind === 'sales' ? SALES_FIELDS : PRICE_FIELDS

  function onFile(file: File) {
    setFileName(file.name)
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const prepared = prepareCsv(res.data, fields)
        if (!prepared) {
          toast.error('Could not read any rows from that file')
          return
        }
        setCsv(prepared.csv)
        setMapping(prepared.mapping)
        setStep('map')
      },
      error: (err: Error) => toast.error(`Parse failed: ${err.message}`),
    })
  }

  function acceptDropped(file: File | undefined) {
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      toast.error('Please choose a .csv file')
      return
    }
    onFile(file)
  }

  const validation = useMemo(() => {
    if (!csv) return null
    if (kind === 'sales') {
      const v = buildSalesRows(csv.rows, mapping)
      return {
        count: v.valid.length,
        issues: v.issues,
        warnings: v.warnings,
        stats: v.stats,
        salesRows: v.valid,
        priceUpdates: null,
      }
    }
    const { updates, issues } = buildPriceUpdates(csv.rows, mapping, products ?? [])
    return {
      count: updates.length,
      issues,
      warnings: [] as RowIssue[],
      stats: null,
      salesRows: null,
      priceUpdates: updates,
    }
  }, [csv, mapping, kind, products])

  async function runImport() {
    if (!validation || validation.count === 0) return
    setBusy(true)
    try {
      const summary: string[] = []
      if (validation.salesRows) {
        // Insert in chunks to stay under request limits.
        for (let i = 0; i < validation.salesRows.length; i += 500) {
          const chunk = validation.salesRows.slice(i, i + 500)
          const { error } = await supabase.from('sales').insert(chunk)
          if (error) throw new Error(`Row batch ${i + 1}+: ${error.message}`)
        }
        const n = validation.salesRows.length
        const skipped = validation.issues.length
        summary.push(`${n.toLocaleString()} sales rows inserted`)
        if (skipped > 0) summary.push(`${skipped.toLocaleString()} rows skipped (see validation report)`)
        toast.success(`Imported ${n.toLocaleString()} sales rows${skipped ? `, skipped ${skipped.toLocaleString()}` : ''}`)
        logAction(profile?.id, 'Imported Sales CSV', `Imported Sales CSV (${n} rows) from ${fileName}`)
        queryClient.invalidateQueries({ queryKey: SALES_KEY })
      }
      if (validation.priceUpdates) {
        let updated = 0
        let created = 0
        for (const u of validation.priceUpdates) {
          if (u.kind === 'update') {
            const nam = u.nam_price ?? u.product.nam_price ?? 0
            const { error } = await supabase
              .from('products')
              .update({
                supplier_price: u.supplier_price,
                ...(u.nam_price !== null ? { nam_price: u.nam_price } : {}),
                ...(u.supplier ? { supplier: u.supplier } : {}),
                ...(u.category_code ? { category_code: u.category_code } : {}),
                margin: computeProductMargin(u.supplier_price, nam),
              })
              .eq('id', u.product.id)
            if (error) throw new Error(error.message)
            updated++
          } else {
            const { error } = await supabase.from('products').insert({
              name: u.name,
              supplier_price: u.supplier_price,
              nam_price: u.nam_price ?? 0,
              supplier: u.supplier,
              category_code: u.category_code,
              unit: u.unit,
              margin: computeProductMargin(u.supplier_price, u.nam_price ?? 0),
              is_draft: true, // new items from a price list start as drafts
            })
            if (error) throw new Error(error.message)
            created++
          }
        }
        summary.push(`${updated} products updated`, `${created} products created as drafts`)
        const skipped = validation.issues.length
        toast.success(`Updated ${updated}, created ${created} products${skipped ? `, skipped ${skipped}` : ''}`)
        logAction(profile?.id, 'Imported Price List', `Imported Price List: updated ${updated}, created ${created} products from ${fileName}`)
        queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      }
      setResult(summary)
      setStep('done')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep('upload')
    setCsv(null)
    setFileName('')
    setMapping({})
    setResult([])
  }

  const unmappedRequired = fields.filter((f) => f.required && !mapping[f.key])

  return (
    <div className="space-y-4">
      <Stepper step={step} />

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Choose file</CardTitle>
            <CardDescription>
              {kind === 'sales'
                ? 'Sales CSV in the "NAM SUPPLY-SALES ONLY ENCODER" format. Peso strings like ₱1,234.56 and MM/DD/YYYY dates are handled; files without a header row are mapped by column position.'
                : 'Supplier price-list CSV ("Centralized Suppliers\' Price" format). Existing products are matched by name and updated; unknown names become new draft products.'}
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
              <Upload className={cn('h-6 w-6', dragActive ? 'text-accent' : 'text-ink-muted')} />
              <span className="text-sm font-medium">{dragActive ? 'Drop to upload' : 'Click to choose a .csv file'}</span>
              <span className="text-xs text-ink-muted">or drop it here</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {step === 'map' && csv && validation && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Review column mapping</CardTitle>
              <CardDescription>
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                {fileName} — {csv.rows.length.toLocaleString()} data rows.{' '}
                {csv.hasHeaderRow
                  ? 'Mapping was guessed from the header row; re-map any column before committing.'
                  : 'No header row detected — columns were mapped by position. Check each one before committing.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {unmappedRequired.length > 0 && (
                <p className="flex items-center gap-1.5 rounded-md bg-critical/10 px-3 py-2 text-xs font-medium text-critical">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Map the required column{unmappedRequired.length > 1 ? 's' : ''}: {unmappedRequired.map((f) => f.label).join(', ')}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {fields.map((f) => {
                  const missing = f.required && !mapping[f.key]
                  return (
                    <div key={f.key} className="space-y-1">
                      <label className="text-xs font-medium text-ink-secondary">
                        {f.label} {f.required && <span className="text-critical">*</span>}
                      </label>
                      <Select
                        className={cn(missing && 'border-critical')}
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      >
                        <option value="">— not mapped —</option>
                        {csv.headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </Select>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="good">
                  <CheckCircle2 className="h-3 w-3" /> {validation.count.toLocaleString()} rows ready
                </Badge>
                {validation.issues.length > 0 && (
                  <Badge variant="serious">
                    <AlertTriangle className="h-3 w-3" /> {validation.issues.length.toLocaleString()} rows skipped
                  </Badge>
                )}
                {validation.stats && validation.stats.missingCompany > 0 && (
                  <Badge variant="warning">{validation.stats.missingCompany.toLocaleString()} rows missing company</Badge>
                )}
                {validation.stats && validation.stats.badDates > 0 && (
                  <Badge variant="warning">{validation.stats.badDates.toLocaleString()} unparseable dates</Badge>
                )}
                {validation.priceUpdates && (
                  <>
                    <Badge variant="accent">
                      {validation.priceUpdates.filter((u) => u.kind === 'update').length.toLocaleString()} update existing
                    </Badge>
                    <Badge variant="accent">
                      {validation.priceUpdates.filter((u) => u.kind === 'create').length.toLocaleString()} create new
                    </Badge>
                  </>
                )}
              </div>
              {(validation.issues.length > 0 || validation.warnings.length > 0) && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-hairline p-2 text-xs text-ink-secondary">
                  {validation.issues.slice(0, 100).map((issue, i) => (
                    <p key={`s${i}`}>
                      <span className="font-medium text-critical">Skip</span> row {issue.row}: {issue.message}
                    </p>
                  ))}
                  {validation.issues.length > 100 && <p>…and {validation.issues.length - 100} more skipped</p>}
                  {validation.warnings.slice(0, 100).map((w, i) => (
                    <p key={`w${i}`}>
                      <span className="font-medium text-warning-text">Warn</span> row {w.row}: {w.message}
                    </p>
                  ))}
                  {validation.warnings.length > 100 && <p>…and {validation.warnings.length - 100} more warnings</p>}
                </div>
              )}
              <div className="overflow-x-auto rounded-md border border-hairline">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-hairline bg-page/60 text-left text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                      {fields.map((f) => (
                        <th key={f.key} className="px-2 py-1.5 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-b border-hairline last:border-0">
                        {fields.map((f) => (
                          <td key={f.key} className="max-w-40 truncate px-2 py-1.5">
                            {mapping[f.key] ? row[mapping[f.key]] : <span className="text-ink-muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csv.rows.length > PREVIEW_ROWS && (
                <p className="flex items-center gap-1 text-[11px] text-ink-muted">
                  <Info className="h-3 w-3" /> Showing the first {PREVIEW_ROWS} of {csv.rows.length.toLocaleString()} rows.
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={reset}>Start over</Button>
                <Button onClick={runImport} disabled={busy || validation.count === 0}>
                  {busy ? 'Importing…' : `Import ${validation.count.toLocaleString()} rows`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.map((line, i) => (
              <p key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-good" /> {line}
              </p>
            ))}
            <Button variant="outline" onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
