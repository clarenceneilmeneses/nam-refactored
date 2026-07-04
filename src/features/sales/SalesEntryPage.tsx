import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Package, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useProductSearch } from '@/hooks/useProducts'
import { useClients } from '@/hooks/useClients'
import { useCreateSales, useSales } from '@/hooks/useSales'
import { useCreateQuotationBatch, useQuotations } from '@/hooks/useQuotations'
import { Autocomplete } from '@/components/shared/Autocomplete'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORIES } from '@/lib/categories'
import { computeDueDate, computeSaleLine, round2 } from '@/lib/calculations'
import { formatPeso, toISODate } from '@/lib/format'
import { nextQuoteRef } from '@/features/quotations/quoteRef'
import { ClientListDialog } from './ClientListDialog'
import { ClientFormDialog } from './ClientFormDialog'
import type { ClientRow, SaleInsert } from '@/types/database'

/** Document header, shared by every queued item (legacy form.php top section). */
type HeaderState = {
  date: string
  po_number: string
  company: string
  address: string
  tin: string
  contact_person: string
  payment_term: string
  remarks: string
}

/** Item form state — numbers stay as strings so inputs can be blank. */
type ItemState = {
  item: string
  category: string
  quantity: string
  sn: string
  suppliers_price: string
  nam_unit_price: string
  supplier: string
  supplier_invoice_no: string
  date_delivered: string
  due_date: string
  si_number: string
}

type QueueItem = {
  item: string
  category: string
  quantity: number
  sn: string
  suppliers_price: number
  nam_unit_price: number
  supplier: string
  supplier_invoice_no: string
  date_delivered: string
  due_date: string
  si_number: string
}

const emptyHeader = (): HeaderState => ({
  date: toISODate(new Date()),
  po_number: '',
  company: '',
  address: '',
  tin: '',
  contact_person: '',
  payment_term: '',
  remarks: '',
})

const emptyItem: ItemState = {
  item: '',
  category: '',
  quantity: '1',
  sn: '',
  suppliers_price: '',
  nam_unit_price: '',
  supplier: '',
  supplier_invoice_no: '',
  date_delivered: '',
  due_date: '',
  si_number: '',
}

const ITEM_INPUT_ID = 'se-item'

function focusItemInput() {
  requestAnimationFrame(() => document.getElementById(ITEM_INPUT_ID)?.focus())
}

/**
 * Sales Entry batch encoder (legacy form.php + submit_batch.php):
 * entry form on the left, draft queue on the right — nothing hits the
 * database until the queue is submitted as sales or saved as a quotation.
 */
export function SalesEntryPage() {
  const { data: clients } = useClients()
  const { data: sales } = useSales()
  const { data: quotations } = useQuotations()
  const createSales = useCreateSales()
  const createQuotationBatch = useCreateQuotationBatch()

  const [header, setHeader] = useState<HeaderState>(emptyHeader)
  const [item, setItem] = useState<ItemState>(emptyItem)
  const [lock, setLock] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [clientListOpen, setClientListOpen] = useState(false)
  const [clientForm, setClientForm] = useState<{ open: boolean; client: ClientRow | null }>({ open: false, client: null })

  // Async product autocomplete: name ilike %q% limit 10, debounced a keystroke.
  const [productQuery, setProductQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setProductQuery(item.item), 200)
    return () => clearTimeout(t)
  }, [item.item])
  const { data: productMatches } = useProductSearch(productQuery)
  const productOptions = useMemo(
    () => (productMatches ?? []).map((p) => ({ label: p.name, data: p })),
    [productMatches],
  )

  // Company suggestions: clients master first, then companies already in sales.
  const companyOptions = useMemo(() => {
    const seen = new Map<string, { address: string | null; tin: string | null; contact: string | null; term: string | null }>()
    for (const c of clients ?? []) {
      seen.set(c.company_name, { address: c.address, tin: c.tin, contact: c.contact_person, term: c.default_payment_term })
    }
    for (const s of sales ?? []) {
      if (s.company && !seen.has(s.company)) {
        seen.set(s.company, { address: s.address, tin: s.tin, contact: s.contact_person_contact, term: s.payment_term })
      }
    }
    return [...seen.entries()].map(([label, data]) => ({ label, data }))
  }, [clients, sales])

  function setH<K extends keyof HeaderState>(key: K, value: string) {
    setHeader((h) => ({ ...h, [key]: value }))
  }
  function setI<K extends keyof ItemState>(key: K, value: string) {
    setItem((i) => ({ ...i, [key]: value }))
  }

  function fillFromClient(fill: { company: string; address: string | null; tin: string | null; contact: string | null; term: string | null }) {
    setHeader((h) => ({
      ...h,
      company: fill.company,
      address: fill.address ?? '',
      tin: fill.tin ?? '',
      contact_person: fill.contact ?? '',
      payment_term: fill.term ?? '',
    }))
  }

  const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0))
  const suppliersPrice = Number(item.suppliers_price) || 0
  const namUnitPrice = Number(item.nam_unit_price) || 0
  const totalCost = round2(quantity * suppliersPrice)
  const totalSales = round2(quantity * namUnitPrice)

  const editing = editingIndex !== null

  function saveItem() {
    if (!item.item.trim()) {
      toast.error('Item description is required')
      return
    }
    if (!item.category) {
      toast.error('Category is required')
      return
    }
    if (quantity < 1) {
      toast.error('Quantity must be at least 1')
      return
    }
    if (namUnitPrice <= 0) {
      toast.error('NAM unit price is required')
      return
    }
    const entry: QueueItem = {
      item: item.item.trim(),
      category: item.category,
      quantity,
      sn: item.sn.trim(),
      suppliers_price: round2(suppliersPrice),
      nam_unit_price: round2(namUnitPrice),
      supplier: item.supplier.trim(),
      supplier_invoice_no: item.supplier_invoice_no.trim(),
      date_delivered: item.date_delivered,
      due_date: item.due_date,
      si_number: item.si_number.trim(),
    }
    if (editingIndex !== null) {
      setQueue((q) => q.map((row, i) => (i === editingIndex ? entry : row)))
      setEditingIndex(null)
    } else {
      setQueue((q) => [...q, entry])
    }
    if (lock) {
      // Rapid encoding: keep the shared header, clear only the item fields.
      setItem(emptyItem)
      focusItemInput()
    } else {
      setHeader(emptyHeader())
      setItem(emptyItem)
    }
  }

  function editQueued(index: number) {
    const row = queue[index]
    setItem({
      item: row.item,
      category: row.category,
      quantity: String(row.quantity),
      sn: row.sn,
      suppliers_price: row.suppliers_price ? String(row.suppliers_price) : '',
      nam_unit_price: row.nam_unit_price ? String(row.nam_unit_price) : '',
      supplier: row.supplier,
      supplier_invoice_no: row.supplier_invoice_no,
      date_delivered: row.date_delivered,
      due_date: row.due_date,
      si_number: row.si_number,
    })
    setEditingIndex(index)
    focusItemInput()
  }

  function cancelEdit() {
    setEditingIndex(null)
    setItem(emptyItem)
  }

  function removeQueued(index: number) {
    setQueue((q) => q.filter((_, i) => i !== index))
    if (editingIndex === index) cancelEdit()
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1)
  }

  function validateBatch(): boolean {
    if (queue.length === 0) {
      toast.error('The queue is empty')
      return false
    }
    if (!header.company.trim()) {
      toast.error('Company is required')
      return false
    }
    return true
  }

  async function submitAsSales() {
    if (!validateBatch()) return
    const company = header.company.trim()
    const rows: SaleInsert[] = queue.map((q) => {
      const totals = computeSaleLine({
        quantity: q.quantity,
        suppliersPrice: q.suppliers_price,
        namUnitPrice: q.nam_unit_price,
      })
      return {
        date: header.date,
        po_number: header.po_number.trim() || null,
        company,
        address: header.address.trim() || null,
        tin: header.tin.trim() || null,
        contact_person_contact: header.contact_person.trim() || null,
        payment_term: header.payment_term.trim() || null,
        remarks: header.remarks.trim() || null,
        item: q.item,
        category: q.category,
        sn: q.sn || null,
        supplier: q.supplier || null,
        quantity_requested: q.quantity,
        suppliers_price: q.suppliers_price,
        nam_unit_price: q.nam_unit_price,
        total_actual_amount: totals.totalActualAmount,
        total_nam_amount: totals.totalNamAmount,
        income: totals.income,
        income_percent: totals.incomePercent,
        withholding_tax: totals.withholdingTax,
        total_amount_due: totals.totalAmountDue,
        date_delivered: q.date_delivered || null,
        due_date: q.due_date || computeDueDate(q.date_delivered || null, header.payment_term),
        si_number: q.si_number || null,
        sales_invoice_no: q.supplier_invoice_no || null,
        payment_status: 'Pending',
      }
    })
    try {
      await createSales.mutateAsync({
        rows,
        log: { action: 'Batch Sales Entry', description: `Submitted ${rows.length} item(s) for ${company}` },
      })
      toast.success(`${rows.length} item(s) submitted as sales for ${company}`)
      setQueue([])
      cancelEdit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function saveAsQuotation() {
    if (!validateBatch()) return
    const company = header.company.trim()
    const quoteRef = nextQuoteRef((quotations ?? []).map((q) => q.quote_ref))
    try {
      await createQuotationBatch.mutateAsync({
        date: header.date,
        quoteRef,
        company,
        poNumber: header.po_number.trim() || null,
        paymentTerm: header.payment_term.trim() || null,
        remarks: header.remarks.trim() || null,
        status: 'Pending',
        items: queue.map((q) => ({
          item: q.item,
          category: q.category || null,
          quantity: q.quantity,
          suppliers_price: q.suppliers_price,
          nam_unit_price: q.nam_unit_price,
        })),
      })
      toast.success(`Saved ${queue.length} item(s) as quotation ${quoteRef}`)
      setQueue([])
      cancelEdit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const queueTotal = round2(queue.reduce((sum, q) => sum + round2(q.quantity * q.nam_unit_price), 0))
  const busy = createSales.isPending || createQuotationBatch.isPending

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sales Entry</h1>
        <p className="text-xs text-ink-muted">
          Queue items under one document header, then submit the batch as sales or save it as a quotation.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {/* Left panel — entry form */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Document Header</CardTitle>
                <CardDescription>Shared across every queued item.</CardDescription>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-secondary" title="Keep these values after each added item">
                <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={lock} onChange={(e) => setLock(e.target.checked)} />
                Lock
              </label>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="se-date">Date *</Label>
                <Input id="se-date" type="date" value={header.date} onChange={(e) => setH('date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-po">PO Number</Label>
                <Input id="se-po" value={header.po_number} placeholder="PO or Inquiry Ref" onChange={(e) => setH('po_number', e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="se-company">Company *</Label>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline cursor-pointer"
                      onClick={() => setClientListOpen(true)}
                    >
                      <Users className="h-3 w-3" /> Select from List
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline cursor-pointer"
                      onClick={() => setClientForm({ open: true, client: null })}
                    >
                      <UserPlus className="h-3 w-3" /> Add New Client
                    </button>
                  </span>
                </div>
                <Autocomplete
                  id="se-company"
                  value={header.company}
                  options={companyOptions}
                  placeholder="Start typing a company…"
                  onChange={(text) => setH('company', text)}
                  onSelect={(option) =>
                    fillFromClient({
                      company: option.label,
                      address: option.data.address,
                      tin: option.data.tin,
                      contact: option.data.contact,
                      term: option.data.term,
                    })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="se-address">Address</Label>
                <Input id="se-address" value={header.address} onChange={(e) => setH('address', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-tin">TIN</Label>
                <Input id="se-tin" value={header.tin} onChange={(e) => setH('tin', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-contact">Contact Person</Label>
                <Input id="se-contact" value={header.contact_person} onChange={(e) => setH('contact_person', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-term">Payment Terms</Label>
                <Input id="se-term" value={header.payment_term} placeholder="e.g. 30 Days" onChange={(e) => setH('payment_term', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-remarks">Remarks</Label>
                <Textarea id="se-remarks" rows={1} value={header.remarks} onChange={(e) => setH('remarks', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Item Details</CardTitle>
              <CardDescription>Pick a product to auto-fill prices, category, and supplier — new items are allowed.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={ITEM_INPUT_ID}>Item Description *</Label>
                <Autocomplete
                  id={ITEM_INPUT_ID}
                  value={item.item}
                  options={productOptions}
                  maxResults={10}
                  placeholder="Search products or type a new item…"
                  onChange={(text) => setI('item', text)}
                  onSelect={({ data }) =>
                    setItem((i) => ({
                      ...i,
                      item: data.name,
                      category: data.category_code || 'OFFICE SUPPLIES',
                      supplier: data.supplier ?? '',
                      suppliers_price: data.supplier_price ? String(data.supplier_price) : '',
                      nam_unit_price: data.nam_price ? String(data.nam_price) : '',
                    }))
                  }
                  renderOption={({ data }) => (
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{data.name}</span>
                      <span className="shrink-0 text-xs text-ink-muted tabular-nums">{formatPeso(data.nam_price)}</span>
                    </span>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-category">Category *</Label>
                <Select id="se-category" value={item.category} onChange={(e) => setI('category', e.target.value)}>
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="se-qty">Quantity *</Label>
                  <Input id="se-qty" type="number" min={1} value={item.quantity} onChange={(e) => setI('quantity', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="se-sn">S/N</Label>
                  <Input id="se-sn" value={item.sn} onChange={(e) => setI('sn', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-cost">Supplier Cost</Label>
                <Input id="se-cost" type="number" step="0.01" min={0} value={item.suppliers_price} onChange={(e) => setI('suppliers_price', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-price">NAM Unit Price *</Label>
                <Input id="se-price" type="number" step="0.01" min={0} value={item.nam_unit_price} onChange={(e) => setI('nam_unit_price', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-total-cost">Total Cost</Label>
                <Input id="se-total-cost" readOnly tabIndex={-1} className="bg-page tabular-nums" value={formatPeso(totalCost)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-total-sales">Total Sales</Label>
                <Input id="se-total-sales" readOnly tabIndex={-1} className="bg-page tabular-nums" value={formatPeso(totalSales)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-supplier">Supplier Name</Label>
                <Input id="se-supplier" value={item.supplier} onChange={(e) => setI('supplier', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-supplier-inv">Supplier Invoice #</Label>
                <Input id="se-supplier-inv" value={item.supplier_invoice_no} onChange={(e) => setI('supplier_invoice_no', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-delivered">Date Delivered</Label>
                <Input id="se-delivered" type="date" value={item.date_delivered} onChange={(e) => setI('date_delivered', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-due">Due Date</Label>
                <Input id="se-due" type="date" value={item.due_date} onChange={(e) => setI('due_date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="se-si">SI Number</Label>
                <Input id="se-si" value={item.si_number} onChange={(e) => setI('si_number', e.target.value)} />
              </div>
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button className="flex-1" onClick={saveItem}>
                  {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editing ? 'Update Item' : 'Add to Queue'}
                </Button>
                {editing && (
                  <Button variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4" /> Cancel Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel — the queue */}
        <Card className="xl:sticky xl:top-4">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Queue</CardTitle>
              <CardDescription>Nothing is saved until the batch is submitted.</CardDescription>
            </div>
            <Badge variant="accent">{queue.length} Item{queue.length === 1 ? '' : 's'}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Package className="h-8 w-8 text-baseline" />
                <p className="text-sm font-medium text-ink-secondary">No items queued</p>
                <p className="text-xs text-ink-muted">Fill in the item details and add them to the queue.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-hairline">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Price</th>
                      <th className="px-2 py-2 text-right font-medium">Total</th>
                      <th className="w-20 px-2 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((row, i) => (
                      <tr key={`${row.item}-${i}`} className={`border-b border-hairline last:border-0 ${i === editingIndex ? 'bg-accent-soft/30' : ''}`}>
                        <td className="px-3 py-2">
                          <span className="font-medium text-ink">{row.item}</span>
                          <span className="block text-xs text-ink-muted tabular-nums">
                            {row.category} · Cost {formatPeso(row.suppliers_price)} · Total cost {formatPeso(round2(row.quantity * row.suppliers_price))}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.quantity}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatPeso(row.nam_unit_price)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatPeso(round2(row.quantity * row.nam_unit_price))}</td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${row.item}`} onClick={() => editQueued(i)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${row.item}`} onClick={() => removeQueued(i)}>
                              <Trash2 className="h-3.5 w-3.5 text-critical" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {queue.length > 0 && (
              <p className="text-right text-sm text-ink-secondary">
                Queue total: <strong className="text-ink tabular-nums">{formatPeso(queueTotal)}</strong>
              </p>
            )}

            <div className="flex flex-col gap-2 border-t border-hairline pt-3 sm:flex-row">
              <Button className="flex-1" disabled={queue.length === 0 || busy} onClick={submitAsSales}>
                <Plus className="h-4 w-4" /> {createSales.isPending ? 'Submitting…' : 'Submit as Sales'}
              </Button>
              <Button
                className="flex-1 bg-warning text-[#3d2b00] hover:bg-[#e19f0e]"
                disabled={queue.length === 0 || busy}
                onClick={saveAsQuotation}
              >
                <FileText className="h-4 w-4" /> {createQuotationBatch.isPending ? 'Saving…' : 'Save as Quotation'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ClientListDialog
        open={clientListOpen}
        onClose={() => setClientListOpen(false)}
        onSelect={(client) =>
          fillFromClient({
            company: client.company_name,
            address: client.address,
            tin: client.tin,
            contact: client.contact_person,
            term: client.default_payment_term,
          })
        }
        onEdit={(client) => setClientForm({ open: true, client })}
      />

      <ClientFormDialog
        open={clientForm.open}
        onClose={() => setClientForm({ open: false, client: null })}
        client={clientForm.client}
        onSaved={(saved) => {
          // Adding a new client from the form flows straight into the header.
          if (!clientForm.client) {
            fillFromClient({
              company: saved.company_name,
              address: saved.address,
              tin: saved.tin,
              contact: saved.contact_person,
              term: saved.default_payment_term,
            })
          }
        }}
      />
    </div>
  )
}
