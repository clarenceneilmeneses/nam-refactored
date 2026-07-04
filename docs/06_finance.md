# Task: Rebuild the Finance / Collections page to legacy parity

Legacy source: finance.php. Purpose: receivables tracking and payment collection. Gate behind manage_finance.

## Features

- KPI cards over ALL sales: Collected (Σ total_nam_amount, Paid), Outstanding (Σ, Pending), Overdue (Σ, Pending + due_date < today) — plus counts.
- Filter row: text search (PO, SI, item, company) · Company select · Payment-Terms select (distinct values) · date range with a clear-dates button · segmented status filter All / Pending / **Overdue** / Paid (Overdue = Pending with past due_date).
- Table sorted: unpaid first, then by due date. Columns: Client Details (company bold + PO + item + qty small) · Date · Total Amount (₱ bold) · **Due Date Tracker** · Payment Action.
- Due Date Tracker badges: Paid → green "✓ Status: Cleared" (+ date_paid shown) · no due date → gray "No Due Date Set" · overdue → red "⚠ Overdue (N days)" · due ≤3 days → yellow "🕐 Due in N days" · else blue "Due in N days".
- Payment Action: Pending rows show a green "Mark as Paid" button; Paid rows an outlined "Undo / Mark Pending". Optimistic update; Paid sets date_paid = now(), undo nulls it. Log "Updated Payment Status".

## Acceptance checklist

- Overdue segmented filter shows exactly Pending-with-past-due rows; totals match the KPI card.
- Marking Paid flips the badge to Cleared with today's date without a page reload; Undo restores the countdown badge.
