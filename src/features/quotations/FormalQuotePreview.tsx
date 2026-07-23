import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { parseCurrency, round2 } from '@/lib/calculations'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { CLIENTS_KEY, saveClientRecord, useClients } from '@/hooks/useClients'
import { PRODUCTS_KEY, saveProductUnit, useProducts } from '@/hooks/useProducts'
import { saveQuoteSigner } from '@/hooks/useProfile'
import { QUOTE_DOC_TERMS_KEY, QUOTE_DOC_TERM_DEFAULTS, saveQuoteDocTerms, useQuoteDocTerms } from '@/hooks/useQuoteDocTerms'
import type { QuoteDocTerms } from '@/types/database'
import { computeDocTotals, type VatMode } from './formalDocMath'
import { SIGNATURE_KEYS, SIGNER_DEFAULTS, fileToDataUrl, itemImageKey, loadCachedImage, saveCachedImage } from './quoteImages'

export type FormalQuoteLine = { item: string; quantity: number; nam_unit_price: number }

type FormalQuotePreviewProps = {
  onClose: () => void
  company: string | null
  address: string | null
  quoteRef: string | null
  /** ISO date (yyyy-MM-dd) — printed as-is on the document. */
  date: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  items: FormalQuoteLine[]
}

type DocRow = { key: string; name: string; qty: number; price: number; image: string | null }

/** Doc fields persisted back to the client profile (15_clients_contact_details.sql, 21_clients_conforme.sql). */
type ClientDocDetails = { contact_person: string; contact_number: string; email: string; address: string; conforme_name: string }

/** Totals rows: commas + 2 decimals (₱ prefixed where rendered). */
function money(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Unit price column: plain 2 decimals, no thousands separator (legacy format). */
function moneyPlain(n: number): string {
  return n.toFixed(2)
}

/**
 * Inline-editable text. Uncontrolled on purpose: the children stay the
 * constant initial string, so React re-renders (totals updating) never
 * clobber what the user typed into the DOM.
 */
function Editable({
  initial,
  className,
  onText,
  block,
}: {
  initial: string
  className?: string
  onText?: (text: string) => void
  block?: boolean
}) {
  const [text] = useState(initial)
  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      className={cn('fq-editable', className)}
      // .fq-editable is inline-block for the in-sentence spans; a block
      // Editable must actually stack (e.g. signatory name over position) —
      // without this, two short block Editables share one line.
      style={block ? { display: 'block' } : undefined}
      onInput={onText ? (e) => onText((e.currentTarget as HTMLElement).textContent ?? '') : undefined}
    >
      {text}
    </Tag>
  )
}

function ImageUpload({
  cacheKey,
  value,
  onChange,
  className,
  emptyLabel,
}: {
  cacheKey: string
  value: string | null
  onChange: (dataUrl: string) => void
  className?: string
  emptyLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const url = await fileToDataUrl(file)
            onChange(url)
            if (!saveCachedImage(cacheKey, url)) toast.warning('Image added, but too large to cache for future quotes')
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      />
      <button
        type="button"
        title={value ? 'Click to replace image' : emptyLabel}
        className={cn(
          'fq-upload-box flex items-center justify-center overflow-hidden cursor-pointer',
          !value && 'fq-empty border-2 border-dashed border-[#9aa7b5] text-[10px] leading-tight text-[#64748b]',
          className,
        )}
        onClick={() => inputRef.current?.click()}
      >
        {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : emptyLabel}
      </button>
    </>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 font-bold">{label}</span>
      <span className="flex-1 font-bold">{children}</span>
    </div>
  )
}

/**
 * Formal Document Preview: print-ready NAM quotation, fully inline-editable.
 * Layout mirrors the legacy printed quote (quote format.pdf) exactly.
 * Item images and the e-signature persist in localStorage (legacy
 * cache_img_* keys) so they auto-load on future quotes.
 */
export function FormalQuotePreview({
  onClose,
  company,
  address,
  quoteRef,
  date,
  paymentTerm,
  remarks,
  items,
}: FormalQuotePreviewProps) {
  // VAT mode, lead time, validity and the replacement window are company-wide
  // defaults (20_quote_doc_terms.sql), not per-document state: they prefill
  // from app_settings and edits save back on print/close, so they stop
  // resetting to the legacy wording on every quote.
  const { data: terms, isPending: termsPending } = useQuoteDocTerms()
  // null until someone touches the select — the stored default wins before that.
  const [vatOverride, setVatOverride] = useState<VatMode | null>(null)
  const [lessWht, setLessWht] = useState(false)
  const [rows, setRows] = useState<DocRow[]>(() =>
    items.map((line, i) => ({
      key: `${i}-${line.item}`,
      name: line.item,
      qty: line.quantity,
      price: line.nam_unit_price,
      image: loadCachedImage(itemImageKey(line.item)),
    })),
  )
  const [signature, setSignature] = useState<string | null>(() => loadCachedImage(SIGNATURE_KEYS[0]))

  // Contact person / number / email prefill from the client profile and any
  // edits are written back on print/close — no more retyping them per quote.
  const queryClient = useQueryClient()
  const { profile, refreshProfile } = useAuth()
  const { data: clients, isPending: clientsPending } = useClients()
  const client = useMemo(() => {
    const name = (company ?? '').trim().toLowerCase()
    if (!name) return null
    return (clients ?? []).find((c) => c.company_name.trim().toLowerCase() === name) ?? null
  }, [clients, company])
  // Current doc values (mutated by the Editables) and the last-persisted
  // snapshot; refs because contentEditable edits must never trigger re-renders.
  const detailsRef = useRef<ClientDocDetails | null>(null)
  const savedRef = useRef<ClientDocDetails | null>(null)

  const persistClientDetails = () => {
    const d = detailsRef.current
    const saved = savedRef.current
    const name = (company ?? '').trim()
    if (!d || !name) return
    if (
      saved &&
      d.contact_person.trim() === saved.contact_person.trim() &&
      d.contact_number.trim() === saved.contact_number.trim() &&
      d.email.trim() === saved.email.trim() &&
      d.address.trim() === saved.address.trim() &&
      d.conforme_name.trim() === saved.conforme_name.trim()
    )
      return
    savedRef.current = { ...d }
    // A conforme line left as the company name stays NULL, so a later rename
    // of the client still flows through to the document.
    const conforme = d.conforme_name.trim()
    void saveClientRecord({
      id: client?.id,
      company_name: name,
      contact_person: d.contact_person.trim() || null,
      contact_number: d.contact_number.trim() || null,
      email: d.email.trim() || null,
      address: d.address.trim() || null,
      conforme_name: conforme && conforme !== name ? conforme : null,
    })
      .then((row) => {
        queryClient.invalidateQueries({ queryKey: CLIENTS_KEY })
        logAction(profile?.id, 'Saved Client', `Saved client contact details from quote: ${row.company_name}`)
        toast.success(`Contact details saved for ${row.company_name} — they'll auto-fill on the next quote`)
      })
      .catch((e) => toast.error(`Couldn't save client details: ${(e as Error).message}`))
  }
  // UOM prefills from products.unit and edits save back the same way as the
  // contact details — keyed by the ORIGINAL item name, so retitling the
  // description on the doc stays cosmetic.
  const { data: products, isPending: productsPending } = useProducts()
  const uomRef = useRef<string[] | null>(null)
  const uomSavedRef = useRef<string[] | null>(null)

  const persistUomEdits = () => {
    const uoms = uomRef.current
    const saved = uomSavedRef.current
    if (!uoms || !saved) return
    const changed = items
      .map((line, i) => ({ item: line.item, uom: (uoms[i] ?? '').trim(), before: (saved[i] ?? '').trim() }))
      .filter(({ item, uom, before }) => item.trim() !== '' && uom !== '' && uom !== before)
    if (changed.length === 0) return
    uomSavedRef.current = [...uoms]
    void Promise.all(changed.map(({ item, uom }) => saveProductUnit(item, uom)))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
        logAction(
          profile?.id,
          'Saved Product',
          `Updated UOM from quote: ${changed.map((c) => `${c.item} → ${c.uom}`).join(', ').slice(0, 300)}`,
        )
        toast.success(`UOM saved for ${changed.length} item(s) — it'll auto-fill on the next quote`)
      })
      .catch((e) => toast.error(`Couldn't save UOM: ${(e as Error).message}`))
  }

  // Signatory name/position follow the ACCOUNT (users.quote_signer_*), so
  // they travel with the login across devices. An account that never saved
  // one signs as itself: its own display name over the legacy position. No
  // device-local fallback — on shared PCs it leaked one user's name into
  // everyone else's quotes.
  const signerRef = useRef<{ name: string; title: string } | null>(null)
  const signerSavedRef = useRef<{ name: string; title: string } | null>(null)
  if (!signerRef.current) {
    signerRef.current = {
      name: profile?.quote_signer_name ?? profile?.full_name?.toUpperCase() ?? SIGNER_DEFAULTS.name,
      title: profile?.quote_signer_title ?? SIGNER_DEFAULTS.title,
    }
    signerSavedRef.current = { ...signerRef.current }
  }
  const signer = signerRef.current

  const persistSigner = () => {
    const s = signerRef.current
    const saved = signerSavedRef.current
    if (!s || !saved || !profile) return
    const name = s.name.trim()
    const title = s.title.trim()
    if (name === saved.name.trim() && title === saved.title.trim()) return
    signerSavedRef.current = { name, title }
    void saveQuoteSigner(profile.id, name, title)
      .then(() => {
        refreshProfile()
        logAction(profile.id, 'Updated Profile', `Updated quote signatory to "${name}${title ? `, ${title}` : ''}"`)
        toast.success('Signature name & position saved to your account')
      })
      .catch((e) => toast.error(`Couldn't save signatory details: ${(e as Error).message}`))
  }

  // Document terms — same shape as the blocks above, but shared by everyone
  // rather than attached to a client, a product or an account.
  const termsRef = useRef<QuoteDocTerms | null>(null)
  const termsSavedRef = useRef<QuoteDocTerms | null>(null)
  // Derived rather than state: the stored default applies until the select is
  // touched, and the ref stays in step so the save below sees the live value.
  const vatMode: VatMode = vatOverride ?? terms?.vat_mode ?? QUOTE_DOC_TERM_DEFAULTS.vat_mode
  if (termsRef.current) termsRef.current.vat_mode = vatMode

  const persistDocTerms = () => {
    const t = termsRef.current
    const saved = termsSavedRef.current
    if (!t || !saved) return
    // A field cleared on the document keeps its previous wording — an empty
    // lead time would otherwise become the default for every future quote.
    const next: QuoteDocTerms = {
      vat_mode: t.vat_mode,
      lead_time: t.lead_time.trim() || saved.lead_time,
      validity: t.validity.trim() || saved.validity,
      replacement_days: t.replacement_days.trim() || saved.replacement_days,
    }
    if (
      next.vat_mode === saved.vat_mode &&
      next.lead_time === saved.lead_time &&
      next.validity === saved.validity &&
      next.replacement_days === saved.replacement_days
    )
      return
    termsSavedRef.current = next
    // The RPC writes its own system_logs entry.
    void saveQuoteDocTerms(next)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: QUOTE_DOC_TERMS_KEY })
        toast.success('Quotation terms saved — every future quote starts with these')
      })
      .catch((e) => toast.error(`Couldn't save the quotation terms: ${(e as Error).message}`))
  }

  const persistAll = () => {
    persistClientDetails()
    persistUomEdits()
    persistSigner()
    persistDocTerms()
  }
  // Persist on close too (Close button, Escape, navigating away) — the ref
  // keeps the unmount cleanup pointed at the latest values.
  const persistRef = useRef(persistAll)
  persistRef.current = persistAll
  useEffect(() => () => persistRef.current(), [])

  const handlePrint = () => {
    persistAll()
    const doc = document.getElementById('formal-quote-doc')
    if (doc) {
      // A4 is 297mm ≈ 1122px at CSS 96dpi. The doc is laid out at true print
      // width (210mm) with print padding, so scrollHeight is the printed
      // height. A doc that only slightly overruns one page (the classic
      // one-item-with-an-image case) shrinks onto a single page via the
      // --fq-print-zoom rule in index.css; genuinely long documents keep
      // their natural size and paginate normally.
      const PAGE_PX = 1122
      const h = doc.scrollHeight
      const zoom = h > PAGE_PX && h < PAGE_PX * 1.4 ? (PAGE_PX - 8) / h : 1
      document.documentElement.style.setProperty('--fq-print-zoom', zoom.toFixed(4))
    }
    window.print()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Scopes the @media print rules (hide the app shell, print in normal
    // flow) to while this preview is open — see #formal-quote-doc in index.css.
    document.documentElement.classList.add('fq-print-mode')
    document.body.classList.add('fq-print-mode')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      document.documentElement.classList.remove('fq-print-mode')
      document.body.classList.remove('fq-print-mode')
    }
  }, [onClose])

  function patchRow(index: number, patch: Partial<DocRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  // The Editables are uncontrolled (initial value only), so don't render the
  // document until the client/product/terms lookups have settled — a late
  // prefill would never reach the DOM. The first two are warm from the page
  // behind this; the terms row is a single-key read.
  if (clientsPending || productsPending || termsPending) return null

  const itemsTotal = round2(rows.reduce((sum, r) => sum + round2(r.qty * r.price), 0))
  const totals = computeDocTotals(itemsTotal, vatMode, lessWht)

  if (!termsRef.current) {
    termsRef.current = { ...(terms ?? QUOTE_DOC_TERM_DEFAULTS), vat_mode: vatMode }
    termsSavedRef.current = { ...termsRef.current }
  }
  const docTerms = termsRef.current

  if (!detailsRef.current) {
    detailsRef.current = {
      contact_person: client?.contact_person ?? '',
      contact_number: client?.contact_number ?? '',
      email: client?.email ?? '',
      address: (address || client?.address) ?? '',
      conforme_name: client?.conforme_name ?? company ?? '',
    }
    savedRef.current = { ...detailsRef.current }
  }
  const details = detailsRef.current

  if (!uomRef.current) {
    uomRef.current = items.map((line) => {
      const name = line.item.trim().toLowerCase()
      const product = (products ?? []).find((p) => p.name.trim().toLowerCase() === name)
      return product?.unit?.trim() || 'SET'
    })
    uomSavedRef.current = [...uomRef.current]
  }
  const uoms = uomRef.current

  // Portal to <body>: the app shell's overflow-y-auto <main> would otherwise
  // clip the document out of the print output entirely.
  return createPortal(
    <div className="fq-overlay fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Formal quotation preview">
      <div className="mx-auto max-w-[900px]">
        {/* Control strip — never printed */}
        <div className="fq-controls mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface p-3 shadow-lg print:hidden">
          <p className="min-w-48 flex-1 text-xs text-ink-secondary">
            💡 <strong>Live Editing:</strong> Click any text to type. Contact details are remembered per client; the VAT mode, lead time and
            validity are remembered for every quote.
          </p>
          <Select
            value={vatMode}
            onChange={(e) => setVatOverride(e.target.value as VatMode)}
            className="w-44"
            aria-label="VAT mode"
          >
            <option value="inclusive">VAT Inclusive (12%)</option>
            <option value="exclusive">VAT Exclusive (+12%)</option>
            <option value="exempt">VAT Exempt (0%)</option>
          </Select>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={lessWht} onChange={(e) => setLessWht(e.target.checked)} />
            Less 1% WHT
          </label>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Print Document
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>

        {/* The document — laid out at true A4 width with print padding, so the
            screen is an honest one-page preview and handlePrint's height
            measurement matches the paper exactly. */}
        <div id="formal-quote-doc" className="mx-auto w-[210mm] max-w-full bg-white px-[12mm] py-[10mm] text-[13px] leading-snug text-black shadow-xl">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-[4px] border-[#003366] pb-3">
            <div className="flex items-start gap-3">
              <img
                src="/logo.png"
                alt=""
                className="h-16 w-16 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div className="text-[11px]">
                <h1 className="text-lg font-bold tracking-wide text-[#003366]">NAM BUILDERS AND SUPPLY CORP.</h1>
                <p>
                  <strong>MAIN:</strong> RNA BUILDING, BRGY SANTIAGO, MALVAR, BATANGAS, 4233
                </p>
                <p className="font-bold text-[#2a78d6]">SATELLITE OFFICE: Yatco Subdivision, Barangay 4, Tanauan City, Batangas</p>
                <p>
                  <strong>CONTACT NO:</strong> 0963-732-6844 / 0917-834-8811 / 0901-556-352
                </p>
                <p>
                  <strong>EMAIL:</strong> sales@nambuilders.com / admin@nambuilders.com
                </p>
              </div>
            </div>
            <div className="pt-2 text-2xl font-bold tracking-[0.25em] text-[#44546a]">QUOTATION</div>
          </div>

          {/* Customer detail */}
          <div className="mt-4 text-[12px]">
            <p className="mb-1 text-[13px] font-bold">CUSTOMER DETAIL</p>
            <div className="flex justify-between gap-8">
              <div className="flex-1 space-y-0.5">
                <DetailRow label="COMPANY NAME:">
                  <Editable initial={company ?? ''} className="min-w-40" />
                </DetailRow>
                <DetailRow label="COMPANY ADDRESS:">
                  <Editable initial={details.address} className="min-w-40" onText={(t) => { details.address = t }} />
                </DetailRow>
                <DetailRow label="CONTACT PERSON:">
                  <Editable initial={details.contact_person} className="min-w-40" onText={(t) => { details.contact_person = t }} />
                </DetailRow>
                <DetailRow label="CONTACT NUMBER:">
                  <Editable initial={details.contact_number} className="min-w-40" onText={(t) => { details.contact_number = t }} />
                </DetailRow>
                <DetailRow label="EMAIL ADDRESS:">
                  <Editable initial={details.email} className="min-w-40" onText={(t) => { details.email = t }} />
                </DetailRow>
                <div className="flex gap-2 pt-2">
                  <span className="w-36 shrink-0 font-bold">TERMS:</span>
                  <Editable initial={paymentTerm ?? ''} className="min-w-24" />
                </div>
              </div>
              <div className="w-72 space-y-0.5 self-start">
                <div className="flex gap-2">
                  <span className="w-36 shrink-0 font-bold">QUOTATION NO:</span>
                  <Editable initial={quoteRef ?? ''} className="min-w-24 flex-1 font-bold" />
                </div>
                <div className="flex gap-2">
                  <span className="w-36 shrink-0 font-bold">QUOTATION DATE:</span>
                  <Editable initial={date} className="min-w-24 flex-1 font-bold" />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <table className="mt-4 w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="w-10 border border-black px-2 py-1.5 text-center font-bold">S/N</th>
                <th className="w-28 border border-black px-2 py-1.5 text-center font-bold">IMAGE</th>
                <th className="border border-black px-2 py-1.5 text-center font-bold">DESCRIPTION</th>
                <th className="w-16 border border-black px-2 py-1.5 text-center font-bold">UOM</th>
                <th className="w-20 border border-black px-2 py-1.5 text-center font-bold">QUANTITY</th>
                <th className="w-28 border border-black px-2 py-1.5 text-center font-bold">UNIT PRICE</th>
                <th className="w-28 border border-black px-2 py-1.5 text-center font-bold">TOTAL AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key}>
                  <td className="border border-black px-2 py-1 text-center align-middle tabular-nums">{String(i + 1).padStart(3, '0')}</td>
                  <td className="border border-black p-1 text-center align-middle">
                    <ImageUpload
                      cacheKey={itemImageKey(row.name)}
                      value={row.image}
                      onChange={(url) => patchRow(i, { image: url })}
                      className={cn('mx-auto', row.image ? 'h-[100px] w-[100px]' : 'h-9 w-[100px]')}
                      emptyLabel="📷 add image"
                    />
                  </td>
                  <td className="border border-black px-2 py-1 align-middle font-bold">
                    <Editable block initial={row.name} className="w-full" />
                  </td>
                  <td className="border border-black px-2 py-1 text-center align-middle">
                    <Editable initial={uoms[i] ?? 'SET'} className="min-w-8 text-center" onText={(t) => { uoms[i] = t }} />
                  </td>
                  <td className="border border-black px-2 py-1 text-center align-middle tabular-nums">
                    <Editable initial={String(row.qty)} className="min-w-8 text-center" onText={(t) => patchRow(i, { qty: parseCurrency(t) })} />
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-middle tabular-nums">
                    <Editable initial={moneyPlain(row.price)} className="min-w-14 text-right" onText={(t) => patchRow(i, { price: parseCurrency(t) })} />
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-middle font-bold tabular-nums">{money(round2(row.qty * row.price))}</td>
                </tr>
              ))}
            </tbody>
            {/* Totals — table rows so the amounts align with the last column */}
            <tfoot>
              <tr>
                <td colSpan={6} className="border border-black px-2 py-1 text-right font-bold">
                  VATABLE SALES:
                </td>
                <td className="border border-black px-2 py-1 text-right font-bold tabular-nums">₱{money(totals.vatableSales)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="border border-black px-2 py-1 text-right font-bold">
                  {vatMode === 'exempt' ? 'VAT (0%):' : 'VAT (12%):'}
                </td>
                <td className="border border-black px-2 py-1 text-right font-bold tabular-nums">₱{money(totals.vat)}</td>
              </tr>
              {lessWht && (
                <tr>
                  <td colSpan={6} className="border border-black px-2 py-1 text-right font-bold">
                    LESS 1% WHT:
                  </td>
                  <td className="border border-black px-2 py-1 text-right font-bold tabular-nums">(₱{money(totals.wht)})</td>
                </tr>
              )}
              <tr className="text-[14px]">
                <td colSpan={6} className="border-2 border-black px-2 py-1.5 text-right font-bold">
                  GRAND TOTAL AMOUNT
                </td>
                <td className="border-2 border-black px-2 py-1.5 text-right font-bold tabular-nums">₱{money(totals.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Lower blocks */}
          <div className="mt-5 flex gap-6 text-[11px]">
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[12px] font-bold">PAYMENT DETAILS</p>
                <div className="flex gap-1">
                  <span className="w-28 shrink-0 font-bold">BANK NAME</span>
                  <span>: SECURITY BANK</span>
                </div>
                <div className="flex gap-1">
                  <span className="w-28 shrink-0 font-bold">ACCOUNT NAME</span>
                  <span>: NAM BUILDERS AND SUPPLY CORP.</span>
                </div>
                <div className="flex gap-1">
                  <span className="w-28 shrink-0 font-bold">ACCOUNT NO.</span>
                  <span className="font-bold">: 0000079551887</span>
                </div>
              </div>
              <div>
                <p className="text-[12px] font-bold">CHECK DETAILS</p>
                <div className="flex gap-1">
                  <span className="w-28 shrink-0 font-bold">Name</span>
                  <span>
                    : <Editable initial="NAM BUILDERS AND SUPPLY CORP" className="min-w-40" />
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[12px] font-bold">TERMS AND CONDITION</p>
                <div className="mt-1 space-y-2 text-[10px]">
                  <div>
                    <p className="font-bold underline">Payment Terms</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>If there are any price change NAM BUILDERS AND SUPPLY CORP will resend a quotation prior to process an order.</li>
                      <li>Check or Cash Payment must be collected by NAM BUILDERS AND SUPPLY CORP.</li>
                      <li>Only items stated in this quotation shall be stated in the PURCHASE ORDER.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-bold underline">Delivery Terms</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>
                        Client shall provide weekly projected requirements and{' '}
                        <Editable
                          initial={docTerms.lead_time}
                          className="min-w-6 text-center font-bold"
                          onText={(t) => {
                            docTerms.lead_time = t
                          }}
                        />{' '}
                        days lead time for planning purpose. Any modification in the daily should be communicated twenty-four (24) hours before the
                        schedule.
                      </li>
                      <li>Client Scheduled delivery on Monday-Friday.</li>
                      <li>
                        Client Authorized Representative must be present at the company to acknowledge the products and quantity described on the
                        Delivery Receiving.
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-bold underline">Quality Terms</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>Client Authorized Representative must signed the Receiving Inspection Stamp.</li>
                      <li>
                        Items reported as damaged or wrong items must be replaced within{' '}
                        <Editable
                          initial={docTerms.replacement_days}
                          className="min-w-4 text-center font-bold"
                          onText={(t) => {
                            docTerms.replacement_days = t
                          }}
                        />{' '}
                        days of the reported date (Receiving Inspection Stamp), provided all eligibility criteria are met.
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-bold underline">Validity</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>
                        <Editable
                          initial={docTerms.validity}
                          className="min-w-10 font-bold"
                          onText={(t) => {
                            docTerms.validity = t
                          }}
                        />{' '}
                        validity effective receipt of this quotation.
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-bold underline">Remarks / Notes</p>
                    <Editable block initial={remarks ?? ''} className="mt-1 min-h-10 w-full border border-[#d5dbe3] p-1" />
                  </div>
                </div>
              </div>
            </div>

            <div className="w-72 shrink-0 border-l border-[#555] pl-5">
              <p>Thank you for giving us the opportunity to do business with you.</p>
              <p className="mt-3 text-justify">
                If the terms and conditions in this quotation are acceptable, please indicate your acceptance of them by signing in the space provided
                below and returning signed counterpart of this proposal to NAM BUILDERS AND SUPPLY CORP. Upon NAM BUILDERS AND SUPPLY CORP received of
                this quotation, the terms and conditions contained herein shall constitute a binding agreement between your company and NAM BUILDERS
                AND SUPPLY CORP, effective as of the date NAM BUILDERS AND SUPPLY CORP received.
              </p>
              <p className="mt-5">Sincerely,</p>
              <ImageUpload
                cacheKey={SIGNATURE_KEYS[0]}
                value={signature}
                onChange={setSignature}
                className="mt-1 h-[60px] w-[160px]"
                emptyLabel="Add E-Sign"
              />
              <Editable block initial={signer.name} className="text-[13px] font-bold" onText={(t) => { signer.name = t }} />
              <Editable block initial={signer.title} className="text-[10px]" onText={(t) => { signer.title = t }} />
              <p className="mt-6 font-bold">Conforme:</p>
              {/* The accepting party's name sits at the BOTTOM of the block,
                  directly above its caption, so the gap under "Conforme:" is
                  the space they sign in — the signature then lands over the
                  printed name, as the caption says. Prefilled with the client
                  company (clients such as PFF treat the signed quotation as
                  their purchase order, so the accepting company has to be
                  named on it) and saved per client once edited. */}
              <Editable
                block
                initial={details.conforme_name}
                className="mt-12 font-bold"
                onText={(t) => {
                  details.conforme_name = t
                }}
              />
              <p className="text-[10px]">Signature over printed name</p>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body,
  )
}
