# Task: Rebuild the Quotations module to legacy parity — including the Formal Document Preview with item images

Legacy source: quotations.php (1,837 lines — the richest page). Three big pieces: (A) the grouped quotation manager with a status workflow, (B) the Draft Workspace encoder, (C) the printable Formal Quotation document with per-item image uploads, live editing, VAT modes, WHT, and e-signatures. The current rebuild is missing the image preview entirely — that is a headline feature here.

## A. Quotation manager

**Status stat cards** (top, whole-table counts + ₱ Σ total_amount): Pending Review (yellow clock) / Approved & Ready (blue signature) / Reserved Stock (red bookmark) / Converted to Sales (green double-check, green left border).

**Toolbar**: "Create New Quotation" (opens Draft Workspace) · "Merge Duplicate Clients" (yellow — modal listing distinct company names with checkboxes; pick a target company; on confirm, UPDATE both quotations AND sales setting company = target for every selected duplicate, then log "Merged Companies") · segmented filter All Quotes / Action Needed (groups containing any non-Converted item) / Converted · search box over companies, refs, and items (client-side filter of the rendered groups).

**Grouped accordion list**: quotations grouped Company → quote_ref. Company accordion header shows building icon, name, a yellow "N Action Required" pill when the company has non-converted items, and "N Items Total" pill. Inside, one card per quote_ref with header: "Ref: {ref}" (ref in primary color) · date badge ("February 13, 2026") · "Inquiry #: {po}" badge when present · buttons:
- **+ Add Item** — opens the Draft Workspace pre-locked to this company/ref/PO/terms/remarks so new items append to the same quotation.
- **✎ Edit Group** — modal editing group-level PO, payment terms, remarks (updates all rows sharing the ref). Log it.
- **🖨 Print Formal Quote** — opens the Formal Document Preview (section C) for ALL items in this ref.
- **🗑 Delete group** — confirm; deletes all non-Converted rows of the ref, RESTORING product stock for any Approved rows (add quantity back). Log "Deleted Quotation Group".

Item rows within the card: Item name · Qty · unit price small + total bold ("₱X / ₱Y") · status pill (Pending gray, Approved blue, Reserved red, Converted green — Converted rows rendered at 50% opacity) · actions:
- **↺ Buy Again** (always): opens the Draft Workspace with a fresh ref, same company, and this item preloaded into the queue.
- **✎ Edit item** (non-Converted): modal with Item name, Qty, Supplier Price, NAM Price + the markup/margin calculator group (below); saving recomputes total_amount. Log it.
- **🗑 Remove item** (non-Converted): confirm; if the row was Approved, restore its stock first. Log it.
- **🔖 Reserve toggle** (Pending⇄Reserved only): flips status; button solid red when Reserved. Log "Updated Quote Status".
- **📝 Approve** (Pending/Reserved): confirm "This will DEDUCT stock" — check products.current_stock ≥ qty; if insufficient show error "Cannot Finalize/Approve: Insufficient Stock"; else deduct stock and set status Approved, in one transaction. Log it.
- **✓ Finalize** (Pending/Approved/Reserved): converts to a sale — inserts into sales (today's date, company, category, item, qty, prices, computed totals/income/income_percent, PO, terms, remarks; date_delivered and due_date NULL) and sets quotation status = Converted. If the quote was NOT already Approved, deduct stock now (Approved ones already did). One transaction (RPC). Log "Converted Quotation".

## B. Draft Workspace (Create New / Add Item / Buy Again all open this)

Modal-xl, static backdrop, warn on close if the queue is non-empty. Left column:
1. Document Header: Date, Quote Reference (auto-generated, editable) — generator: `YYYY-NNN`, next NNN = last ref for the current year + 1, zero-padded to 3 (e.g. 2026-047). Client Company (autocomplete + "Select from List" client modal, same as sales entry), Address (auto-filled from client record), Inquiry #, Terms, group Remarks.
2. Add Item: item autocomplete from products (auto-fills prices/category/supplier). **Stock tracker panel** appears when a known product is selected: On-Hand Stock / Reserved (Σ quantity_requested of quotations with status 'Reserved' for that item) / True Available = onHand − reserved, in green. Quantity input. **Price calculator group**: Supplier Cost, Selling Price, Markup %, Margin % — four-way bidirectional: editing price recomputes markup+margin; editing markup ((n−s)/s) recomputes price+margin; editing margin ((n−s)/n) recomputes price+markup; Item Total = qty × selling updates always. "Add to Draft Queue" button.

Right column: draft queue table (Description/Qty/Unit Price/Total/remove), item-count pill, Clear Queue. Footer buttons: **Preview Formal Document** (section C on the live queue) · **Save & Reserve** (persists batch with status Reserved) · **Save Quote Draft** (status Pending). Saving inserts one quotations row per item (total = qty × price, category fallback "Uncategorized") AND auto-creates any unknown item as a draft product (is_draft = true, stock 0, margin string computed) — single transaction. Log "Created Quotation".

## C. Formal Document Preview (the flagship — currently missing)

A modal (max-width ~850px page) rendering a print-ready NAM quotation that is FULLY EDITABLE INLINE before printing. Reachable from the Draft Workspace (unsaved queue) and from any saved quote group ("Print Formal Quote").

**Control strip** (hidden in print): hint text "Live Editing: Click any text to type. Click the dashed box to add item images!", a **VAT Mode** select — VAT Inclusive (12%) / VAT Exclusive (+12%) / VAT Exempt (0%) — and a **"Less 1% WHT"** checkbox; both recompute the totals footer live.

**Document layout** (Arial; print CSS via a dedicated print stylesheet or react-to-print, portrait A4, colors preserved):
- Letterhead: company logo (from /public, hidden if missing) + "NAM BUILDERS AND SUPPLY CORP." in #003366 with MAIN address (RNA Building, Brgy Santiago, Malvar, Batangas, 4233), SATELLITE OFFICE (Yatco Subdivision, Barangay 4, Tanauan City, Batangas — in primary blue), CONTACT NO (0963-732-6844 / 0917-834-8811 / 0901-556-352), EMAIL (nam.nswt@myyahoo.com). Right side: big letterspaced "QUOTATION".
- CUSTOMER DETAIL block, every value inline-editable (contenteditable with dashed-underline styling that disappears in print): Company Name, Address, Contact Person, Contact Number, Email · right column: Quotation No, Quotation Date, Vehicle No, Inquiry Ref #.
- **Items table** with columns S/N (001, 002…) | **IMAGE** | DESCRIPTION (editable) | UOM (editable, default "SET") | QUANTITY (editable number) | UNIT PRICE (editable number) | TOTAL AMOUNT (computed). The IMAGE cell: a 100×100 dashed "📷 add image" box; clicking opens a file picker; the chosen image renders 100×100 object-contain (click to replace) and PRINTS with the document. Persist images keyed by sanitized item name (legacy used localStorage key `cache_img_{itemName}` — keep that so re-printing the same item recalls its photo; optionally also mirror to a Supabase Storage bucket `quote-images` so images survive across devices, but localStorage-first matches legacy).
- Editing qty/price recomputes the row total and the footer: Vatable Sales / VAT line / optional red "LESS 1% WHT" row / GRAND TOTAL. Math: inclusive → vatable = total/1.12, vat = total − vatable, grand = total; exclusive → vat = total×0.12, grand = total + vat; exempt → vat 0, label "VAT (0%):". WHT = 1% of vatable, subtracted from grand. Round each to 2 decimals.
- Lower-left column: PAYMENT DETAILS (Bank: SECURITY BANK / Account Name: NAM BUILDERS AND SUPPLY CORP. / Account No: 0000079551887), CHECK DETAILS, then TERMS AND CONDITION with the legacy fixed text under Payment Terms / Delivery Terms (with an editable "4-6" days lead-time inline field) / Quality Terms (editable "7" days) / Validity (editable "1 month"), then an editable Remarks box prefilled from the quote's remarks.
- Lower-right column: acceptance paragraph ("Thank you for giving us the opportunity…") and TWO e-signature slots (180×60): dashed "Add E-Sign" upload boxes → uploaded signature image with a bottom border, persisted as `cache_img_sig_1` / `cache_img_sig_2` so signatures auto-load on every future quote. Include name/position lines and a client "Conforme" signature line.
- **Print Document** button triggers the browser print of ONLY the document area (everything else hidden via print CSS), editable-field styling stripped, background colors forced with print-color-adjust.

## Acceptance checklist

- Creating a draft with 3 items produces 3 rows sharing one auto ref (e.g. 2026-048) and auto-creates unknown items as draft products.
- Approve deducts stock and blocks when insufficient; deleting an Approved item restores stock; Finalize creates a correct sales row and grays the quote out.
- Stock tracker shows True Available = on-hand − Σ reserved quotation qty for that item.
- In the preview: uploading an image shows it in the row and in the printed page; reopening a quote containing the same item shows the cached image; both signature slots persist across sessions.
- Switching VAT mode and toggling WHT updates Vatable/VAT/WHT/Grand Total correctly (spot-check: total 1,120 inclusive → vatable 1,000, VAT 120; WHT on → −10, grand 1,110).
- Print output contains only the document, with images and background shading intact.
