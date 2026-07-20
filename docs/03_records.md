# Task: Rebuild the Sales Records page to legacy parity

Legacy source: records.php + get_records.php + update_record.php + delete_record.php + toggle_reserve.php + mark_delivered.php. This is the master ledger — a dense, finance-grade table with KPI cards, five combined filters, row status intelligence, bulk partial delivery, and a full edit modal.

## KPI cards (top, computed from the CURRENTLY FILTERED rows, live)

Collected (Σ total_nam_amount where Paid), Outstanding (Σ where not Paid AND date_delivered not null — undelivered orders are NOT receivables yet; verified against live records.php 2026-07-20), Overdue Collections in red (Σ where not Paid AND due_date < today AND due_date not null), Pending Delivery (count where date_delivered null).

## Filter bar (all combine, AND logic; Clear Filters button resets)

- Delivery select: All / Pending / Partial / Delivered / Reserved. "Partial" = a not-yet-delivered row whose (po_number, company, item) group already has delivered siblings — compute a per-group delivered count and flag undelivered rows in groups with delivered > 0. "Reserved" = is_reserved true.
- Payment select: All / Unpaid (status Pending) / Paid.
- Company select and Category select (distinct values from data).
- Date range (from / to) on `date`.
- Text search across item, PO, S/N, remarks, TIN (and company).

## The table (paginated ~50/page with First/Prev/Next/Last buttons; horizontal scroll)

Columns: ☑ select-all checkbox + per-row checkbox (only selectable when undelivered) | Date | S/N | PO | Company | Category | Item | Qty | Unit Cost | Total Cost | Unit Price | Total Sales | WHT (Tax) in red | Total Due in green | Income | Margin % | Supplier | Delivery status | Payment | Delivered date | Due Tracker | SI # | Buyer | Remarks (truncated with full-text tooltip) | Actions (sticky right column with left shadow).

Row intelligence:
- Delivery cell: green "Delivered" pill / blue "Partial" pill / gray "Pending" pill; Reserved rows get an additional yellow bookmark pill.
- Due Tracker cell: shows the due date plus a badge — Paid → outlined green "✓ Paid"; no due date → gray "No Due Date"; overdue → red "Overdue (Nd)" AND the whole row tinted #ffe6e6; due within 7 days → yellow "Due in Nd" and row tinted #fff4cc; otherwise blue "Due in Nd".
- Payment cell: clickable toggle Pending⇄Paid. Marking Paid sets date_paid = today; back to Pending nulls it. Log "Updated Payment Status".
- Money columns monospace, ₱ 2-decimals.

Row actions: 🔖 Reserve toggle (flips is_reserved, log it) | ✎ Edit | 🗑 Delete (confirm; log "Deleted Record").

## Bulk deliver (the standout feature — must match legacy exactly)

Checking rows reveals a green "Deliver Selected (N)" button → Bulk Deliver modal: table of the selected items (Item / PO / Pending Qty / editable Deliver Qty defaulting to full). Helper text: "Adjust the quantities below if you are making a partial delivery. Delivering partial quantities will split the remaining amount into a new pending record."

On confirm, per item (single transaction — implement as a Postgres RPC `deliver_items(jsonb)`):
1. If deliverQty < qty: SPLIT the row — insert a new sales row cloning the original (same date, company, address, contact, category, item, PO, terms, remarks, unit prices) with quantity = remainder and recomputed total_actual/total_nam/income/income_percent, date_delivered NULL; then update the original row to quantity = deliverQty with recomputed amounts and date_delivered = today. Log "Partial Delivery: Delivered X out of Y items for {company} (Item: {item})".
2. If full: just set date_delivered = today. Log "Full Delivery".
3. Due-date timer: after each delivery, if the (po_number, company) group now has ZERO undelivered rows, parse the payment term — first number found in the string = days (e.g. "30 Days" → 30); contains "cod"/"cash" → 0; unparseable/empty → 30 — and set due_date = today + days on EVERY row of the group (or just the row itself when PO is empty).

The single "Deliver" flow elsewhere (logistics page) reuses this same RPC.

## Edit modal (modal-xl, sectioned)

Sections and fields: Record Details (Date*, PO, S/N) · Client Information (Company*, Address, TIN, Contact Person) · Product & Financials (Category* fixed dropdown, Item*, Qty*, Supplier Price, NAM Unit Price, WHT amount, read-only computed Total Cost / Total Sales / Total Due = totalSales − WHT / Income / Margin %, recalculated live) · Logistics & Payment (Supplier, Date Delivered, Payment Term, Due Date, SI Number, Buyer, Sales Invoice No, Remarks). Saving recomputes and persists all derived fields exactly like update_record.php (total_amount_due = total_nam − wht) and logs "Updated Record".

## Acceptance checklist

- Filter Delivery=Partial shows exactly the undelivered rows whose PO group has delivered siblings.
- Bulk-delivering 3 of 10 units creates a new pending 7-unit row and marks the original 3-unit row delivered, with amounts summing to the original.
- Delivering the last pending item of a PO with term "45 days" stamps due_date = today+45 on all rows of that PO; term "COD" stamps today.
- Overdue rows are red-tinted; due-in-≤7-days rows yellow-tinted; KPIs recompute when filters change.
- Payment toggle to Paid sets date_paid and immediately flips the Due Tracker badge to "✓ Paid".
