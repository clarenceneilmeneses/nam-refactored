import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { parseCurrency, round2 } from '@/lib/calculations'
import { computeDocTotals, type VatMode } from './formalDocMath'
import { SIGNATURE_KEYS, fileToDataUrl, itemImageKey, loadCachedImage, saveCachedImage } from './quoteImages'

export type FormalQuoteLine = { item: string; quantity: number; nam_unit_price: number }

type FormalQuotePreviewProps = {
  onClose: () => void
  company: string | null
  address: string | null
  quoteRef: string | null
  /** ISO date (yyyy-MM-dd). */
  date: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  items: FormalQuoteLine[]
}

type DocRow = { key: string; name: string; qty: number; price: number; image: string | null }

/** Doc-internal amounts: commas + 2 decimals, no currency symbol. */
function money(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function docDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMMM d, yyyy')
  } catch {
    return iso
  }
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

/**
 * Formal Document Preview: print-ready NAM quotation, fully inline-editable.
 * Item images and the two e-signatures persist in localStorage (legacy
 * cache_img_* keys) so they auto-load on future quotes.
 */
export function FormalQuotePreview({
  onClose,
  company,
  address,
  quoteRef,
  date,
  poNumber,
  paymentTerm,
  remarks,
  items,
}: FormalQuotePreviewProps) {
  const [vatMode, setVatMode] = useState<VatMode>('inclusive')
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
  const [signatures, setSignatures] = useState<Array<string | null>>(() => SIGNATURE_KEYS.map((key) => loadCachedImage(key)))

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

  const itemsTotal = round2(rows.reduce((sum, r) => sum + round2(r.qty * r.price), 0))
  const totals = computeDocTotals(itemsTotal, vatMode, lessWht)

  // Portal to <body>: the app shell's overflow-y-auto <main> would otherwise
  // clip the document out of the print output entirely.
  return createPortal(
    <div className="fq-overlay fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Formal quotation preview">
      <div className="mx-auto max-w-[900px]">
        {/* Control strip — never printed */}
        <div className="fq-controls mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface p-3 shadow-lg print:hidden">
          <p className="min-w-48 flex-1 text-xs text-ink-secondary">
            💡 <strong>Live Editing:</strong> Click any text to type. Click the dashed box to add item images!
          </p>
          <Select value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)} className="w-44" aria-label="VAT mode">
            <option value="inclusive">VAT Inclusive (12%)</option>
            <option value="exclusive">VAT Exclusive (+12%)</option>
            <option value="exempt">VAT Exempt (0%)</option>
          </Select>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={lessWht} onChange={(e) => setLessWht(e.target.checked)} />
            Less 1% WHT
          </label>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print Document
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>

        {/* The document */}
        <div id="formal-quote-doc" className="bg-white p-8 text-[13px] leading-snug text-black shadow-xl">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-4 border-double border-[#003366] pb-3">
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
                  <strong>MAIN:</strong> RNA Building, Brgy Santiago, Malvar, Batangas, 4233
                </p>
                <p className="font-semibold text-[#2a78d6]">
                  <strong>SATELLITE OFFICE:</strong> Yatco Subdivision, Barangay 4, Tanauan City, Batangas
                </p>
                <p>
                  <strong>CONTACT NO:</strong> 0963-732-6844 / 0917-834-8811 / 0901-556-352
                </p>
                <p>
                  <strong>EMAIL:</strong> nam.nswt@myyahoo.com
                </p>
              </div>
            </div>
            <div className="pt-2 text-2xl font-bold tracking-[0.3em] text-[#003366]">QUOTATION</div>
          </div>

          {/* Customer detail */}
          <div className="mt-4 flex justify-between gap-8 text-[12px]">
            <div className="flex-1">
              <p className="mb-1 font-bold text-[#003366]">CUSTOMER DETAIL</p>
              <p>
                <strong>Company Name:</strong> <Editable initial={company ?? ''} className="min-w-40" />
              </p>
              <p>
                <strong>Address:</strong> <Editable initial={address ?? ''} className="min-w-40" />
              </p>
              <p>
                <strong>Contact Person:</strong> <Editable initial="" className="min-w-40" />
              </p>
              <p>
                <strong>Contact Number:</strong> <Editable initial="" className="min-w-40" />
              </p>
              <p>
                <strong>Email:</strong> <Editable initial="" className="min-w-40" />
              </p>
            </div>
            <div className="w-64">
              <p>
                <strong>Quotation No:</strong> <Editable initial={quoteRef ?? ''} className="min-w-24" />
              </p>
              <p>
                <strong>Quotation Date:</strong> <Editable initial={docDate(date)} className="min-w-24" />
              </p>
              <p>
                <strong>Vehicle No:</strong> <Editable initial="" className="min-w-24" />
              </p>
              <p>
                <strong>Inquiry Ref #:</strong> <Editable initial={poNumber ?? ''} className="min-w-24" />
              </p>
            </div>
          </div>

          {/* Items */}
          <table className="mt-4 w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#003366] text-white">
                <th className="border border-[#003366] px-2 py-1.5 text-center">S/N</th>
                <th className="border border-[#003366] px-2 py-1.5 text-center">IMAGE</th>
                <th className="border border-[#003366] px-2 py-1.5 text-left">DESCRIPTION</th>
                <th className="border border-[#003366] px-2 py-1.5 text-center">UOM</th>
                <th className="border border-[#003366] px-2 py-1.5 text-center">QUANTITY</th>
                <th className="border border-[#003366] px-2 py-1.5 text-right">UNIT PRICE</th>
                <th className="border border-[#003366] px-2 py-1.5 text-right">TOTAL AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key}>
                  <td className="border border-[#9aa7b5] px-2 py-1 text-center align-middle tabular-nums">{String(i + 1).padStart(3, '0')}</td>
                  <td className="border border-[#9aa7b5] p-1 text-center align-middle">
                    <ImageUpload
                      cacheKey={itemImageKey(row.name)}
                      value={row.image}
                      onChange={(url) => patchRow(i, { image: url })}
                      className="mx-auto h-[100px] w-[100px]"
                      emptyLabel="📷 add image"
                    />
                  </td>
                  <td className="border border-[#9aa7b5] px-2 py-1 align-middle">
                    <Editable block initial={row.name} className="w-full" />
                  </td>
                  <td className="border border-[#9aa7b5] px-2 py-1 text-center align-middle">
                    <Editable initial="SET" className="min-w-8 text-center" />
                  </td>
                  <td className="border border-[#9aa7b5] px-2 py-1 text-center align-middle tabular-nums">
                    <Editable initial={String(row.qty)} className="min-w-8 text-center" onText={(t) => patchRow(i, { qty: parseCurrency(t) })} />
                  </td>
                  <td className="border border-[#9aa7b5] px-2 py-1 text-right align-middle tabular-nums">
                    <Editable initial={money(row.price)} className="min-w-14 text-right" onText={(t) => patchRow(i, { price: parseCurrency(t) })} />
                  </td>
                  <td className="border border-[#9aa7b5] px-2 py-1 text-right align-middle tabular-nums">{money(round2(row.qty * row.price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-2 ml-auto w-72 text-[12px]">
            <div className="flex justify-between px-2 py-0.5">
              <span className="font-semibold">VATable Sales:</span>
              <span className="tabular-nums">{money(totals.vatableSales)}</span>
            </div>
            <div className="flex justify-between px-2 py-0.5">
              <span className="font-semibold">{vatMode === 'exempt' ? 'VAT (0%):' : 'VAT (12%):'}</span>
              <span className="tabular-nums">{money(totals.vat)}</span>
            </div>
            {lessWht && (
              <div className="flex justify-between px-2 py-0.5 font-semibold text-[#c0392b]">
                <span>LESS 1% WHT:</span>
                <span className="tabular-nums">({money(totals.wht)})</span>
              </div>
            )}
            <div className="mt-0.5 flex justify-between border-t-2 border-[#003366] bg-[#eef5ff] px-2 py-1 font-bold text-[#003366]">
              <span>GRAND TOTAL:</span>
              <span className="tabular-nums">{money(totals.grandTotal)}</span>
            </div>
          </div>

          {/* Lower blocks */}
          <div className="mt-6 flex justify-between gap-8 text-[11px]">
            <div className="flex-1 space-y-3">
              <div>
                <p className="font-bold text-[#003366]">PAYMENT DETAILS</p>
                <p>Bank: SECURITY BANK</p>
                <p>Account Name: NAM BUILDERS AND SUPPLY CORP.</p>
                <p>Account No: 0000079551887</p>
              </div>
              <div>
                <p className="font-bold text-[#003366]">CHECK DETAILS</p>
                <p>
                  Payable to: <Editable initial="NAM BUILDERS AND SUPPLY CORP." className="min-w-40" />
                </p>
              </div>
              <div>
                <p className="font-bold text-[#003366]">TERMS AND CONDITION</p>
                <p>
                  Payment Terms: <Editable initial={paymentTerm ?? ''} className="min-w-16" />
                </p>
                <p>
                  Delivery Terms: <Editable initial="4-6" className="min-w-8 text-center" /> working days upon receipt of P.O.
                </p>
                <p>
                  Quality Terms: Replacement within <Editable initial="7" className="min-w-6 text-center" /> days for defective items.
                </p>
                <p>
                  Validity: <Editable initial="1 month" className="min-w-12" />
                </p>
              </div>
              <div>
                <p className="font-bold text-[#003366]">REMARKS</p>
                <Editable block initial={remarks ?? ''} className="min-h-6 w-full" />
              </div>
            </div>

            <div className="w-80">
              <p className="text-justify">
                Thank you for giving us the opportunity to serve you. If you have any questions regarding this quotation, please contact us.
                To accept this quotation, kindly sign below and return a copy to us.
              </p>
              <div className="mt-5 flex gap-6">
                {SIGNATURE_KEYS.map((key, i) => (
                  <div key={key} className="text-center">
                    <div className="border-b border-black">
                      <ImageUpload
                        cacheKey={key}
                        value={signatures[i]}
                        onChange={(url) => setSignatures((sigs) => sigs.map((s, j) => (j === i ? url : s)))}
                        className="h-[60px] w-[140px]"
                        emptyLabel="Add E-Sign"
                      />
                    </div>
                    <Editable block initial="" className="mt-1 min-h-4 w-full text-center font-semibold" />
                    <Editable block initial={i === 0 ? 'Prepared by' : 'Approved by'} className="w-full text-center text-[10px]" />
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <p className="font-bold">Conforme:</p>
                <div className="mt-8 border-b border-black" />
                <p className="mt-0.5 text-center text-[10px]">Client's Signature over Printed Name / Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
