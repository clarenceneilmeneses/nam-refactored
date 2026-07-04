# Task: Rebuild the Sales Entry page (batch encoder) to legacy parity

Legacy source: form.php + submit_batch.php + save_client.php + get_item.php. This is a two-panel batch encoder: entry form on the left, draft queue on the right. Nothing is written to the database until the batch is submitted.

## Layout

Left panel — the entry form, two sections:

**1. Document Header** (shared across all queued items): Date (default today), PO Number ("PO or Inquiry Ref"), Company (required, autocomplete), Address, TIN, Contact Person, Payment Terms (placeholder "e.g. 30 Days"), Remarks. A "Lock" checkbox (checked by default) beside the header: when locked, submitting an item keeps all header fields and clears only the item fields (item, qty→1, s/n, prices, totals, supplier, invoice #, date delivered) and refocuses the item input — this is the rapid-encoding workflow. When unlocked, the whole form resets after each add.

**2. Item Details**: Item Description (required, async autocomplete against products — see below), Category (fixed dropdown per shared context, required), Quantity (min 1, default 1), S/N, Supplier Cost, NAM Unit Price (required), read-only computed Total Cost (qty×supplier) and Total Sales (qty×NAM) that recalc live on input, Supplier Name, Supplier Invoice #, Date Delivered (optional), Due Date (optional), SI Number.

**Product autocomplete**: as the user types the item name, query products by `name ilike %q%` limit 10; selecting a product auto-fills supplier_price, nam_price, category (fallback OFFICE SUPPLIES), and supplier. Free-text items that don't exist are allowed.

**Client autocomplete + client manager**: Company field autocompletes from clients + distinct sales companies. Selecting a known client auto-fills address, TIN, contact person, and payment terms from the clients table. Beside the label: "Select from List" opens a Client List modal — searchable table of clients with per-row actions: ✎ Edit (opens client modal prefilled), 🗑 Delete client profile (confirm), ✓ Select (fills the form). Plus an "Add New Client" button opening a Client modal with: Company Name (required), TIN (placeholder 000-000-000-000), Default Payment Term, Address, Contact Person — saving upserts into clients and logs "Saved Client".

Right panel — **the queue**: table (Description / Qty / Price / Total / Action) with a count pill ("N Items"), empty state with box icon. Each row has Edit (loads the row back into the form; form shows a Cancel Edit button; saving replaces the row in place) and Remove. Below, two submit buttons, both disabled when queue is empty:
- **"Submit as Sales"** (primary): inserts every queued row into `sales`, computing per row: total_actual_amount, total_nam_amount, income, income_percent (formulas in shared context); date_delivered and due_date nullable. Log "Batch Sales Entry" with item count + company.
- **"Save as Quotation"** (warning/yellow): sends the same queue into `quotations` instead — status 'Pending', auto-generated quote_ref (see 04_quotations for the YYYY-NNN generator), total_amount = qty × nam_price. This is the bridge feature between the two modules; reuse the quotations creation mutation.

Both show a success toast and clear the queue.

## Acceptance checklist

- With Lock checked, adding an item preserves header fields and refocuses the item input.
- Picking a known product fills both prices + category + supplier; picking a known company fills address/TIN/contact/terms.
- Editing a queued row updates it in place and restores the Add button.
- Submit as Sales creates N rows with correct computed income/income_percent; Save as Quotation creates N quotation rows sharing one new quote_ref.
- All four money fields render as ₱ with 2 decimals in the queue.
