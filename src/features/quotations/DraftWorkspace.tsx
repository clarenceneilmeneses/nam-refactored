import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bookmark, ListChecks, Plus, Printer, Save, Trash2, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Autocomplete } from '@/components/shared/Autocomplete'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCreateQuotationBatch, useQuotations } from '@/hooks/useQuotations'
import { useProducts } from '@/hooks/useProducts'
import { useClients } from '@/hooks/useClients'
import { useSales } from '@/hooks/useSales'
import { formatPeso, toISODate } from '@/lib/format'
import { round2 } from '@/lib/calculations'
import { nextQuoteRef } from './quoteRef'
import { PriceCalculator } from './PriceCalculator'
import { ClientPickerDialog } from './ClientPickerDialog'
import { FormalQuotePreview } from './FormalQuotePreview'
import type { QuotationBatchItem } from '@/types/database'

export type WorkspaceGroupLock = {
  company: string | null
  quoteRef: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
}

export type WorkspaceMode =
  /** Blank quote; optional pre-filled company from a client's detail pane. */
  | { kind: 'create'; company?: string | null }
  /** "+ Add Item": header pre-locked to the group's company/ref/PO/terms/remarks. */
  | { kind: 'addItem'; group: WorkspaceGroupLock }
  /** "Buy Again": fresh ref, same company, the item preloaded in the queue. */
  | { kind: 'buyAgain'; company: string | null; item: QuotationBatchItem }

type DraftWorkspaceProps = {
  mode: WorkspaceMode
  onClose: () => void
}

/**
 * Draft Workspace: build a multi-item quote queue and save it as Pending or
 * Reserved. Mount only while open — state resets by unmounting.
 */
export function DraftWorkspace({ mode, onClose }: DraftWorkspaceProps) {
  const { data: quotations } = useQuotations()
  const { data: products } = useProducts()
  const { data: clients } = useClients()
  const { data: sales } = useSales()
  const createBatch = useCreateQuotationBatch()

  const locked = mode.kind === 'addItem'

  // Header fields
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [quoteRef, setQuoteRef] = useState(() =>
    mode.kind === 'addItem' ? mode.group.quoteRef : nextQuoteRef((quotations ?? []).map((q) => q.quote_ref)),
  )
  const [company, setCompany] = useState(() =>
    mode.kind === 'addItem'
      ? (mode.group.company ?? '')
      : mode.kind === 'buyAgain'
        ? (mode.company ?? '')
        : (mode.company ?? ''),
  )
  const [address, setAddress] = useState('')
  const [poNumber, setPoNumber] = useState(() => (mode.kind === 'addItem' ? (mode.group.poNumber ?? '') : ''))
  const [paymentTerm, setPaymentTerm] = useState(() => (mode.kind === 'addItem' ? (mode.group.paymentTerm ?? '') : ''))
  const [remarks, setRemarks] = useState(() => (mode.kind === 'addItem' ? (mode.group.remarks ?? '') : ''))
  const addressTouched = useRef(false)

  // Add-item form
  const [itemName, setItemName] = useState('')
  const [category, setCategory] = useState('')
  const [qtyStr, setQtyStr] = useState('1')
  const [calc, setCalc] = useState({ supplier: 0, price: 0 })
  const [calcSeed, setCalcSeed] = useState({ seq: 0, supplier: 0, price: 0 })

  // Queue
  const [queue, setQueue] = useState<QuotationBatchItem[]>(() => (mode.kind === 'buyAgain' ? [mode.item] : []))
  const [confirmClose, setConfirmClose] = useState(false)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Address-bearing sources first (clients master, then latest sales row) so
  // quotation-only companies don't shadow a known address.
  const companyOptions = useMemo(() => {
    const seen = new Map<string, { address: string | null }>()
    for (const c of clients ?? []) seen.set(c.company_name, { address: c.address })
    for (const s of sales ?? []) {
      if (!s.company) continue
      const existing = seen.get(s.company)
      if (!existing) seen.set(s.company, { address: s.address })
      else if (!existing.address && s.address) existing.address = s.address
    }
    for (const q of quotations ?? []) if (q.company && !seen.has(q.company)) seen.set(q.company, { address: null })
    return [...seen.entries()].map(([label, data]) => ({ label, data }))
  }, [clients, quotations, sales])

  // Auto-fill the address from client/sales records unless the user typed one.
  useEffect(() => {
    if (addressTouched.current || !company.trim()) return
    const name = company.trim().toLowerCase()
    const match = companyOptions.find((o) => o.label.trim().toLowerCase() === name)
    if (match?.data.address) setAddress(match.data.address)
  }, [companyOptions, company])

  const productOptions = useMemo(() => (products ?? []).map((p) => ({ label: p.name, data: p })), [products])

  const matchedProduct = useMemo(() => {
    const name = itemName.trim().toLowerCase()
    if (!name) return undefined
    return (products ?? []).find((p) => p.name.trim().toLowerCase() === name)
  }, [products, itemName])

  // Stock tracker: True Available = on-hand − units held by Reserved quotes.
  const stock = useMemo(() => {
    if (!matchedProduct) return null
    const name = matchedProduct.name.trim().toLowerCase()
    const onHand = matchedProduct.current_stock ?? 0
    const reserved = (quotations ?? [])
      .filter((q) => q.status === 'Reserved' && (q.item ?? '').trim().toLowerCase() === name)
      .reduce((sum, q) => sum + (q.quantity_requested ?? 0), 0)
    return { onHand, reserved, trueAvailable: onHand - reserved }
  }, [matchedProduct, quotations])

  const quantity = Math.max(0, Math.floor(Number(qtyStr) || 0))
  const queueTotal = round2(queue.reduce((sum, i) => sum + round2(i.quantity * i.nam_unit_price), 0))

  function addToQueue() {
    const name = itemName.trim()
    if (!name) {
      toast.error('Enter or pick an item first')
      return
    }
    if (quantity < 1) {
      toast.error('Quantity must be at least 1')
      return
    }
    setQueue((q) => [
      ...q,
      {
        item: name,
        category: category.trim() || matchedProduct?.category_code || null,
        quantity,
        suppliers_price: calc.supplier,
        nam_unit_price: calc.price,
      },
    ])
    setItemName('')
    setCategory('')
    setQtyStr('1')
    setCalc({ supplier: 0, price: 0 })
    setCalcSeed((s) => ({ seq: s.seq + 1, supplier: 0, price: 0 }))
  }

  async function save(status: 'Pending' | 'Reserved') {
    if (!company.trim()) {
      toast.error('Client company is required')
      return
    }
    if (!quoteRef.trim()) {
      toast.error('Quote reference is required')
      return
    }
    if (queue.length === 0) {
      toast.error('The draft queue is empty')
      return
    }
    try {
      await createBatch.mutateAsync({
        date,
        quoteRef: quoteRef.trim(),
        company: company.trim(),
        poNumber: poNumber.trim() || null,
        paymentTerm: paymentTerm.trim() || null,
        remarks: remarks.trim() || null,
        status,
        items: queue,
      })
      toast.success(`Saved ${queue.length} item(s) under ${quoteRef.trim()}${status === 'Reserved' ? ' (stock reserved)' : ''}`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Static backdrop behaviour: warn before discarding a non-empty queue.
  function guardedClose() {
    if (queue.length > 0) setConfirmClose(true)
    else onClose()
  }

  return (
    <>
      <Dialog
        open
        onClose={guardedClose}
        title={mode.kind === 'addItem' ? `Add Items to ${quoteRef}` : 'Quotation Draft Workspace'}
        description={
          mode.kind === 'addItem'
            ? 'New items are saved into the existing quote group.'
            : 'Queue one or more items, then save the draft or reserve stock.'
        }
        className="max-w-6xl"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Left: header details + add item form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dw-date">Date</Label>
                <Input id="dw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dw-ref">Quote Reference</Label>
                <Input id="dw-ref" value={quoteRef} disabled={locked} onChange={(e) => setQuoteRef(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dw-company">Client Company</Label>
                  {!locked && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline cursor-pointer"
                      onClick={() => setClientPickerOpen(true)}
                    >
                      <Users className="h-3 w-3" /> Select from List
                    </button>
                  )}
                </div>
                {locked ? (
                  <Input id="dw-company" value={company} disabled />
                ) : (
                  <Autocomplete
                    id="dw-company"
                    value={company}
                    options={companyOptions}
                    placeholder="Start typing a company…"
                    onChange={(text) => {
                      addressTouched.current = false
                      setCompany(text)
                    }}
                    onSelect={(option) => {
                      setCompany(option.label)
                      if (option.data.address) setAddress(option.data.address)
                    }}
                  />
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="dw-address">Address</Label>
                <Input
                  id="dw-address"
                  value={address}
                  placeholder="Auto-filled from client records"
                  onChange={(e) => {
                    addressTouched.current = true
                    setAddress(e.target.value)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dw-po">Inquiry #</Label>
                <Input id="dw-po" value={poNumber} disabled={locked} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dw-terms">Terms</Label>
                <Input id="dw-terms" value={paymentTerm} disabled={locked} placeholder="e.g. 30 days" onChange={(e) => setPaymentTerm(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="dw-remarks">Remarks</Label>
                <Textarea id="dw-remarks" value={remarks} disabled={locked} rows={2} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>

            <div className="rounded-lg border border-hairline p-3">
              <h3 className="mb-3 text-sm font-semibold text-ink">Add Item</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="dw-item">Product / Description</Label>
                  <Autocomplete
                    id="dw-item"
                    value={itemName}
                    options={productOptions}
                    placeholder="Search products or type a new item…"
                    onChange={setItemName}
                    onSelect={({ data }) => {
                      setItemName(data.name)
                      setCategory(data.category_code ?? '')
                      setCalc({ supplier: data.supplier_price ?? 0, price: data.nam_price ?? 0 })
                      setCalcSeed((s) => ({ seq: s.seq + 1, supplier: data.supplier_price ?? 0, price: data.nam_price ?? 0 }))
                    }}
                    renderOption={({ data }) => (
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{data.name}</span>
                        <span className="shrink-0 text-xs text-ink-muted tabular-nums">{formatPeso(data.nam_price)}</span>
                      </span>
                    )}
                  />
                  {itemName.trim() && !matchedProduct && (
                    <p className="text-xs text-warning-text">New item — it will be saved as a draft product with 0 stock.</p>
                  )}
                </div>

                {stock && (
                  <div className="grid grid-cols-3 gap-2 rounded-md bg-page p-2 text-center text-xs">
                    <div>
                      <p className="text-ink-muted">On-Hand</p>
                      <p className="text-sm font-semibold tabular-nums">{stock.onHand}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">Reserved</p>
                      <p className="text-sm font-semibold tabular-nums text-critical">{stock.reserved}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">True Available</p>
                      <p className="text-sm font-semibold tabular-nums text-good-text">{stock.trueAvailable}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="dw-qty">Quantity</Label>
                    <Input id="dw-qty" type="number" min={1} value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dw-cat">Category</Label>
                    <Input id="dw-cat" value={category} placeholder="Uncategorized" onChange={(e) => setCategory(e.target.value)} />
                  </div>
                </div>

                <PriceCalculator
                  key={calcSeed.seq}
                  initialSupplier={calcSeed.supplier}
                  initialPrice={calcSeed.price}
                  quantity={quantity}
                  onChange={setCalc}
                />

                <Button variant="subtle" className="w-full" onClick={addToQueue}>
                  <Plus className="h-4 w-4" /> Add to Draft Queue
                </Button>
              </div>
            </div>
          </div>

          {/* Right: the draft queue */}
          <div className="flex flex-col rounded-lg border border-hairline">
            <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ListChecks className="h-4 w-4 text-accent" /> Draft Queue
                <Badge variant="accent">{queue.length}</Badge>
              </h3>
              <Button variant="ghost" size="sm" disabled={queue.length === 0} onClick={() => setQueue([])}>
                Clear Queue
              </Button>
            </div>
            <div className="min-h-48 flex-1 overflow-y-auto">
              {queue.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-ink-muted">No items queued yet — add items on the left.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Unit Price</th>
                      <th className="px-2 py-2 text-right font-medium">Total</th>
                      <th className="w-9 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((line, i) => (
                      <tr key={`${line.item}-${i}`} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2">{line.item}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatPeso(line.nam_unit_price)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatPeso(round2(line.quantity * line.nam_unit_price))}</td>
                        <td className="px-2 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Remove ${line.item}`}
                            onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-critical" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-hairline px-3 py-2 text-right text-sm text-ink-secondary">
              Queue total: <strong className="text-ink tabular-nums">{formatPeso(queueTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-4">
          <Button variant="outline" disabled={queue.length === 0} onClick={() => setPreviewOpen(true)}>
            <Printer className="h-4 w-4" /> Preview Formal Document
          </Button>
          <Button
            variant="outline"
            className="border-critical/40 text-critical hover:bg-critical/5"
            disabled={createBatch.isPending}
            onClick={() => save('Reserved')}
          >
            <Bookmark className="h-4 w-4" /> Save &amp; Reserve
          </Button>
          <Button disabled={createBatch.isPending} onClick={() => save('Pending')}>
            <Save className="h-4 w-4" /> {createBatch.isPending ? 'Saving…' : 'Save Quote Draft'}
          </Button>
        </div>
      </Dialog>

      <ClientPickerDialog
        open={clientPickerOpen}
        onClose={() => setClientPickerOpen(false)}
        onPick={(client) => {
          setCompany(client.company_name)
          setAddress(client.address ?? '')
          addressTouched.current = true
        }}
      />

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false)
          onClose()
        }}
        title="Discard draft queue?"
        description={`You have ${queue.length} unsaved item(s) in the queue. Closing the workspace will discard them.`}
        confirmLabel="Discard"
        destructive
      />

      {previewOpen && (
        <FormalQuotePreview
          onClose={() => setPreviewOpen(false)}
          company={company || null}
          address={address || null}
          quoteRef={quoteRef || null}
          date={date}
          poNumber={poNumber || null}
          paymentTerm={paymentTerm || null}
          remarks={remarks || null}
          items={queue.map((l) => ({ item: l.item, quantity: l.quantity, nam_unit_price: l.nam_unit_price }))}
        />
      )}
    </>
  )
}
