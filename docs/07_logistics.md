# Task: Rebuild the Logistics / Driver view to legacy parity

Legacy source: delivery_view.php + get_deliveries.php + mark_delivered.php. Audience: drivers on phones — must be mobile-first. Gate behind view_logistics (this is the ONLY page Drivers see; make it their post-login landing page).

## Features

- Loads all sales rows that are undelivered OR belong to a (company, PO) group with any undelivered item, grouped **Company → PO** ("No PO Number" bucket for empty POs).
- Company card → PO section header with "{done}/{total} items" badge (green when complete) and a slim progress bar (green at 100%, blue otherwise).
- Item rows: checkbox (undelivered only) · item name + qty · either a rounded "Deliver" button (undelivered) or green "✓ Delivered" + delivery date. Delivered items of the group remain visible as a delivered log.
- Single Deliver: prompt for quantity (default full, max = pending qty) → calls the same `deliver_items` RPC from the Records page (partial split + due-date timer logic — do NOT duplicate the logic).
- Bulk mode: checking items reveals "Deliver Selected (N)"; select-all toggle; modal listing selections with editable Deliver Qty per row; confirm calls the RPC with all items.
- Search box filters by company / PO / item. Refresh button. Empty state: "No pending deliveries found."
- Realtime subscription on sales so two drivers see each other's deliveries.

## Acceptance checklist

- On a 375px viewport everything is tappable and readable; Deliver buttons are thumb-sized.
- Partial delivery of 3/10 shows the item as delivered (qty 3) and a new pending 7-qty row appears in the group; progress bar updates.
- Completing the last item of a PO with term "30 days" sets due dates group-wide (verify in Records/Finance).
