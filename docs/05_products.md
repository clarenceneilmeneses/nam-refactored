# Task: Rebuild the Products / Inventory page to legacy parity

Legacy source: products.php + save_product.php + delete_product.php + merge_products.php + get_all_products.php.

## Features

- Client-side loaded product list with instant search (name, category, supplier), paginated ~50/page with First/Prev/Next/Last.
- Table: ☑ checkboxes | Product name | Category | Unit | Supplier | Supp. Price (₱, right) | NAM Price (₱, right) | Margin (center, as stored string e.g. "35.00%") | Inventory (center) | Actions. Inventory cell: red badge with ⚠ when current_stock ≤ reorder_level, otherwise a neutral badge with the count. Draft products (is_draft — auto-created from quotations) get a visible "Draft" tag so they can be completed.
- Add/Edit Product modal: Name*, Category (fixed dropdown), Unit ("e.g. PC, BOX"), Supplier, Current Stock, Reorder Level, and the pricing group — Supplier Price*, NAM Price*, Markup %, Margin % with the same four-way bidirectional calculator used in quotations (share the component). Saving stores margin as a formatted string "NN.NN%". Editing prefills; saving a draft product clears is_draft. Log "Saved Product".
- Delete with confirm; log it.
- **Merge Duplicates**: select ≥2 products via checkboxes (select-all in header) → merge button enables → modal to choose the canonical product among the selected → on confirm, repoint/merge (legacy: keeps the target row, deletes the others; if the duplicates have stock, sum stock into the target) and log "Merged Products". Sales/quotations reference items by name text, so no FK repointing needed — but if names differ, leave historical rows untouched (parity behavior).

## Acceptance checklist

- Search "mop" instantly filters; low-stock items show red ⚠ badges; pagination works on 1,311 products without lag.
- Markup 25% on supplier 100 sets NAM 125 and margin 20%; editing margin to 50% sets NAM 200 and markup 100%.
- Merging 3 duplicates leaves 1 product whose stock = sum of the 3.
