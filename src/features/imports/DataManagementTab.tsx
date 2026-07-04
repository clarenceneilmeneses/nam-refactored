import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CalendarX2, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { SALES_KEY, useSales } from '@/hooks/useSales'
import { PRODUCTS_KEY, useProducts } from '@/hooks/useProducts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const FIRST_DATA_YEAR = 2019

type PendingAction = 'month' | 'all-sales' | 'all-products'

export function DataManagementTab() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: sales } = useSales()
  const { data: products } = useProducts()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [year, setYear] = useState(now.getFullYear())
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  const years = Array.from({ length: now.getFullYear() - FIRST_DATA_YEAR + 1 }, (_, i) => now.getFullYear() - i)
  const monthName = MONTHS[month - 1]

  // Live counts for context before an irreversible delete.
  const salesCount = sales?.length ?? null
  const productsCount = products?.length ?? null
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const monthCount = sales ? sales.filter((s) => (s.date ?? '').startsWith(monthPrefix)).length : null
  const countLabel = (n: number | null) => (n === null ? '' : ` · ${n.toLocaleString()} row${n === 1 ? '' : 's'}`)

  async function deleteSalesByMonth() {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
    const { count, error } = await supabase
      .from('sales')
      .delete({ count: 'exact' })
      .gte('date', start)
      .lt('date', end)
    if (error) throw new Error(error.message)
    queryClient.invalidateQueries({ queryKey: SALES_KEY })
    logAction(profile?.id, 'Deleted Sales by Month', `Deleted ${count ?? 0} sales record(s) for ${monthName} ${year}`)
    return `Deleted ${(count ?? 0).toLocaleString()} sales record(s) for ${monthName} ${year}`
  }

  async function clearAllSales() {
    const { count, error } = await supabase.from('sales').delete({ count: 'exact' }).gte('id', 0)
    if (error) throw new Error(error.message)
    queryClient.invalidateQueries({ queryKey: SALES_KEY })
    logAction(profile?.id, 'Cleared All Sales Data', `Cleared ALL sales data (${count ?? 0} rows)`)
    return `Cleared ALL sales data (${(count ?? 0).toLocaleString()} rows)`
  }

  async function clearAllProducts() {
    const { count, error } = await supabase.from('products').delete({ count: 'exact' }).gte('id', 0)
    if (error) throw new Error(error.message)
    queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    logAction(profile?.id, 'Cleared All Products', `Cleared ALL products (${count ?? 0} rows)`)
    return `Cleared ALL products (${(count ?? 0).toLocaleString()} rows)`
  }

  async function runPending() {
    if (!pending) return
    setBusy(true)
    try {
      const message =
        pending === 'month' ? await deleteSalesByMonth() : pending === 'all-sales' ? await clearAllSales() : await clearAllProducts()
      toast.success(message)
      setPending(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-critical/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-critical">
            <CalendarX2 className="h-4 w-4" /> Delete Sales by Month
          </CardTitle>
          <CardDescription>
            Permanently removes every sales record dated within the selected month. You will be asked to type the
            month name to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-secondary">Month</label>
            <Select className="w-40" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-secondary">Year</label>
            <Select className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="destructive" onClick={() => setPending('month')}>
              <Trash2 className="h-4 w-4" /> Delete {monthName} {year}…
            </Button>
            {monthCount !== null && (
              <span className="text-[11px] text-ink-muted tabular-nums">
                {monthCount.toLocaleString()} record{monthCount === 1 ? '' : 's'} in this month
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-critical/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-critical">
            <AlertTriangle className="h-4 w-4" /> Danger zone
          </CardTitle>
          <CardDescription>
            These wipe entire tables and cannot be undone. Each requires typing <code>DELETE</code> to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => setPending('all-sales')}>
            <Trash2 className="h-4 w-4" /> Clear ALL Sales Data{countLabel(salesCount)}…
          </Button>
          <Button variant="destructive" onClick={() => setPending('all-products')}>
            <Trash2 className="h-4 w-4" /> Clear ALL Products{countLabel(productsCount)}…
          </Button>
        </CardContent>
      </Card>

      <TypeToConfirmDialog
        open={pending === 'month'}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        busy={busy}
        title={`Delete all sales for ${monthName} ${year}?`}
        description="Every sales record dated in this month will be permanently deleted."
        phrase={monthName}
        confirmLabel={`Delete ${monthName} ${year}`}
      />
      <TypeToConfirmDialog
        open={pending === 'all-sales'}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        busy={busy}
        title="Clear ALL sales data?"
        description="Every row in the sales table will be permanently deleted."
        phrase="DELETE"
        confirmLabel="Clear all sales"
      />
      <TypeToConfirmDialog
        open={pending === 'all-products'}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        busy={busy}
        title="Clear ALL products?"
        description="Every row in the products table will be permanently deleted."
        phrase="DELETE"
        confirmLabel="Clear all products"
      />
    </div>
  )
}

type TypeToConfirmProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  /** Exact text the user must type before the confirm button enables. */
  phrase: string
  confirmLabel: string
  busy: boolean
}

function TypeToConfirmDialog({ open, onClose, onConfirm, title, description, phrase, confirmLabel, busy }: TypeToConfirmProps) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) setText('')
  }, [open])

  const matches = text.trim() === phrase

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={title} description={description} className="max-w-md">
      <div className="space-y-3">
        <p className="text-xs text-ink-secondary">
          Type <code className="rounded bg-critical/10 px-1 py-0.5 font-semibold text-critical">{phrase}</code> to
          confirm:
        </p>
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={phrase}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches && !busy) onConfirm()
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!matches || busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
