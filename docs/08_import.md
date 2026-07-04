# Task: Rebuild the CSV Import & Data Management page to legacy parity

Legacy source: import.php (Super Admin only — gate the whole page behind role Super Admin, not just a permission). Three tabs: Import Sales, Import Prices, Data Management.

## Tab 1 — Import Sales

Upload a sales CSV (the "NAM SUPPLY-SALES ONLY ENCODER" sheet format). Parse client-side with PapaParse. Requirements from the legacy importer:
- **Dynamic header mapping**: read the header row and map columns by fuzzy header-name matching (date, s/n, po, company, category, item, qty, supplier price, total actual, nam unit price, total nam, income, income %, date delivered, terms, due date, si number, buyer, remarks, supplier…), with a sensible positional fallback if headers are missing. Show the detected mapping in a review step and let the user re-map any column via dropdowns before committing.
- **Currency scrubbing**: strip everything except digits, dot, minus from money cells (handles "₱1,234.56").
- **Date handling**: accept both YYYY-MM-DD and MM/DD/YYYY (legacy regex-extracts MM/DD/YYYY from messy "date paid" strings); blank/invalid → NULL.
- Preview table of the first ~20 parsed rows with a validation report (row count, rows with missing item/company, unparseable dates) before a bulk insert into sales. Recompute income/income_percent when the CSV lacks them. Toast with inserted/skipped counts. Log "Imported Sales CSV (N rows)".

## Tab 2 — Import Prices

Upload a supplier price-list CSV (the "Centralized Suppliers' Price" format): matches products by name — existing products get supplier_price / nam_price / margin / supplier / category updated; unknown names are inserted as new products. Same preview-then-commit flow. Log "Imported Price List".

## Tab 3 — Data Management (destructive zone, red-accented)

- **Delete Sales by Month**: month + year selects → deletes sales rows of that month (double-confirm dialog typing the month name). Log it.
- **Clear ALL Sales Data** and **Clear ALL Products** buttons — each requires a type-to-confirm ("DELETE") dialog. Log with 🔴 severity description.

## Acceptance checklist

- Re-importing one of the original legacy CSVs (₱-formatted currency, MM/DD/YYYY dates) round-trips correctly: totals of imported rows match the CSV sums.
- Mapping review lets me point a mislabeled column to the right field before commit.
- Destructive actions are impossible to trigger with a single click.
