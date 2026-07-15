import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateSale } from '@/hooks/useSales'
import { useAuth } from '@/hooks/useAuth'
import { canEnterSi } from '@/lib/privileges'
import { round2 } from '@/lib/calculations'
import { CATEGORIES } from '@/lib/categories'
import { formatPeso, formatPercent } from '@/lib/format'
import type { SaleRow } from '@/types/database'

type Draft = {
  date: string
  po_number: string
  sn: string
  company: string
  address: string
  tin: string
  contact_person_contact: string
  category: string
  item: string
  quantity: string
  suppliers_price: string
  nam_unit_price: string
  withholding_tax: string
  supplier: string
  date_delivered: string
  payment_term: string
  due_date: string
  si_number: string
  buyer: string
  sales_invoice_no: string
  remarks: string
}

function toDraft(sale: SaleRow): Draft {
  return {
    date: sale.date ?? '',
    po_number: sale.po_number ?? '',
    sn: sale.sn ?? '',
    company: sale.company ?? '',
    address: sale.address ?? '',
    tin: sale.tin ?? '',
    contact_person_contact: sale.contact_person_contact ?? '',
    category: sale.category ?? '',
    item: sale.item ?? '',
    quantity: String(sale.quantity_requested ?? 0),
    suppliers_price: String(sale.suppliers_price ?? 0),
    nam_unit_price: String(sale.nam_unit_price ?? 0),
    withholding_tax: String(sale.withholding_tax ?? 0),
    supplier: sale.supplier ?? '',
    date_delivered: sale.date_delivered ?? '',
    payment_term: sale.payment_term ?? '',
    due_date: sale.due_date ?? '',
    si_number: sale.si_number ?? '',
    buyer: sale.buyer ?? '',
    sales_invoice_no: sale.sales_invoice_no ?? '',
    remarks: sale.remarks ?? '',
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-hairline p-4">
      <legend className="px-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  )
}

/**
 * Legacy update_record.php parity: sectioned full-record editor. Saving
 * recomputes every derived money field (total_amount_due = total_nam − wht)
 * and logs "Updated Record".
 */
export function RecordEditDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const updateSale = useUpdateSale()
  const { privileges } = useAuth()
  // SI # entry is the assigned encoder's alone (Roles tab → Special privileges).
  const siEditable = canEnterSi(privileges)

  useEffect(() => {
    setDraft(sale ? toDraft(sale) : null)
  }, [sale])

  if (!sale || !draft) return null

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  // Live-recalculated derived figures, mirroring update_record.php.
  const qty = Number(draft.quantity) || 0
  const supplierPrice = Number(draft.suppliers_price) || 0
  const namPrice = Number(draft.nam_unit_price) || 0
  const wht = Number(draft.withholding_tax) || 0
  const totalCost = round2(qty * supplierPrice)
  const totalSales = round2(qty * namPrice)
  const totalDue = round2(totalSales - wht)
  const income = round2(totalSales - totalCost)
  const marginPct = totalSales > 0 ? round2((income / totalSales) * 100) : 0

  // Legacy rows can carry categories outside the fixed list — keep them selectable.
  const categoryOptions: string[] =
    draft.category && !CATEGORIES.includes(draft.category as (typeof CATEGORIES)[number])
      ? [draft.category, ...CATEGORIES]
      : [...CATEGORIES]

  async function onSave() {
    if (!draft || !sale) return
    if (!draft.date || !draft.company.trim() || !draft.category || !draft.item.trim() || qty <= 0) {
      toast.error('Date, Company, Category, Item, and a quantity above zero are required.')
      return
    }
    try {
      await updateSale.mutateAsync({
        id: sale.id,
        patch: {
          date: draft.date,
          po_number: draft.po_number || null,
          sn: draft.sn || null,
          company: draft.company.trim(),
          address: draft.address || null,
          tin: draft.tin || null,
          contact_person_contact: draft.contact_person_contact || null,
          category: draft.category,
          item: draft.item.trim(),
          quantity_requested: qty,
          suppliers_price: supplierPrice,
          nam_unit_price: namPrice,
          withholding_tax: wht,
          total_actual_amount: totalCost,
          total_nam_amount: totalSales,
          total_amount_due: totalDue,
          income,
          income_percent: marginPct,
          supplier: draft.supplier || null,
          date_delivered: draft.date_delivered || null,
          payment_term: draft.payment_term || null,
          due_date: draft.due_date || null,
          // SI # is the encoder's; everyone else's save preserves the stored value.
          si_number: siEditable ? draft.si_number || null : (sale.si_number ?? null),
          // Changing the SI # invalidates any prior review — it must be re-approved.
          ...(siEditable && (draft.si_number || '') !== (sale.si_number ?? '')
            ? { si_reviewed: false, si_reviewed_by: null, si_reviewed_at: null }
            : {}),
          buyer: draft.buyer || null,
          sales_invoice_no: draft.sales_invoice_no || null,
          remarks: draft.remarks || null,
        },
        log: {
          action: 'Updated Record',
          description: `Updated record #${sale.id} (${draft.item.trim()}, ${draft.company.trim()})`,
        },
      })
      toast.success(`Record #${sale.id} updated`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit record #${sale.id}`} className="max-w-4xl">
      <div className="space-y-4">
        <Section title="Record Details">
          <div className="space-y-1">
            <Label>Date *</Label>
            <Input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>PO Number</Label>
            <Input value={draft.po_number} onChange={(e) => set('po_number', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>S/N</Label>
            <Input value={draft.sn} onChange={(e) => set('sn', e.target.value)} />
          </div>
        </Section>

        <Section title="Client Information">
          <div className="space-y-1">
            <Label>Company *</Label>
            <Input value={draft.company} onChange={(e) => set('company', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>TIN</Label>
            <Input value={draft.tin} onChange={(e) => set('tin', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Person</Label>
            <Input value={draft.contact_person_contact} onChange={(e) => set('contact_person_contact', e.target.value)} />
          </div>
        </Section>

        <Section title="Product & Financials">
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Select category…</option>
              {categoryOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Item *</Label>
            <Input value={draft.item} onChange={(e) => set('item', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Qty *</Label>
            <Input type="number" min={1} value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Supplier Price</Label>
            <Input type="number" step="0.01" min={0} value={draft.suppliers_price} onChange={(e) => set('suppliers_price', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>NAM Unit Price</Label>
            <Input type="number" step="0.01" min={0} value={draft.nam_unit_price} onChange={(e) => set('nam_unit_price', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>WHT (Tax) Amount</Label>
            <Input type="number" step="0.01" min={0} value={draft.withholding_tax} onChange={(e) => set('withholding_tax', e.target.value)} />
          </div>
          <div className="sm:col-span-3 flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-page px-3 py-2 text-xs text-ink-secondary tabular-nums">
            <span>Total Cost: <strong>{formatPeso(totalCost)}</strong></span>
            <span>Total Sales: <strong>{formatPeso(totalSales)}</strong></span>
            <span>Total Due: <strong className="text-good-text">{formatPeso(totalDue)}</strong></span>
            <span>Income: <strong>{formatPeso(income)}</strong></span>
            <span>Margin: <strong>{formatPercent(marginPct)}</strong></span>
          </div>
        </Section>

        <Section title="Logistics & Payment">
          <div className="space-y-1">
            <Label>Supplier</Label>
            <Input value={draft.supplier} onChange={(e) => set('supplier', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Date Delivered</Label>
            <Input type="date" value={draft.date_delivered} onChange={(e) => set('date_delivered', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment Term</Label>
            <Input value={draft.payment_term} placeholder="e.g. 30 Days / COD" onChange={(e) => set('payment_term', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={draft.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>SI Number</Label>
            <Input
              value={draft.si_number}
              disabled={!siEditable}
              onChange={(e) => set('si_number', e.target.value)}
            />
            {!siEditable && (
              <p className="text-[11px] text-ink-muted">Only the assigned SI encoder can edit the SI #.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Buyer</Label>
            <Input value={draft.buyer} onChange={(e) => set('buyer', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Sales Invoice No</Label>
            <Input value={draft.sales_invoice_no} onChange={(e) => set('sales_invoice_no', e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea rows={2} value={draft.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </Section>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={updateSale.isPending}>
          {updateSale.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Dialog>
  )
}
