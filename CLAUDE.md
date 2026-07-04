This is a rewrite of a PHP sales dashboard (NAM Builders and Supply Corp) as a Vite + React 18 + TypeScript SPA on Supabase (Postgres). Tables: sales, quotations, products, clients, company_assignments, users, roles, permissions, role_permissions, system_logs. Real production data is loaded.

Conventions that apply to every task:
- Currency: Philippine Peso, formatted "₱1,234,567.89" (en-PH, always 2 decimals). Dates displayed as "MMM d, yyyy" unless a prompt says otherwise. Timezone: Asia/Manila.
- All data access via typed TanStack Query hooks; no inline supabase.from() in components. No `any`.
- Every create/update/delete mutation also inserts a row into system_logs: { user_id, action, description }. Action strings should match legacy style, e.g. "Created Quotation", "Partial Delivery", "Updated Payment Status".
- Permission gating with <PermissionGate perm="...">: view_dashboard, manage_sales, manage_products, view_logistics, manage_users, manage_finance. Super Admin (role id 1) sees everything.
- MySQL legacy used '0000-00-00' for empty dates; in Postgres these are NULL. "Delivered" means date_delivered IS NOT NULL.
- Category list (fixed dropdown everywhere): OFFICE SUPPLIES, CLEANING MATERIALS, CONSUMABLES, OFFICE TOOLS AND EQUIPMENT, PPE, MATERIALS, COMPANY UNIFORM, OFFICE FURNITURE & FIXTURES, MEDICINE, OTHERS.
- Core money math (lib/calculations.ts, unit-tested):
  total_actual_amount = qty × suppliers_price
  total_nam_amount    = qty × nam_unit_price
  income              = total_nam_amount − total_actual_amount
  income_percent      = income / total_nam_amount × 100 (0 when total_nam_amount = 0)
  total_amount_due    = total_nam_amount − withholding_tax
  markup% = (n−s)/s × 100 ; margin% = (n−s)/n × 100 (bidirectional solvers exist)
- Keep the existing clean UI shell; these tasks add features, not restyle the app.

Design language: Apple-inspired — clean, quiet, content-first.
- Typography: Inter or SF-style system font stack; tight tracking on headings; generous whitespace.
- Color: near-white background (#f5f5f7), white cards, one restrained accent color; muted grays for secondary text; no gradients, no heavy borders.
- Cards: large radius (12–16px), hairline borders or very soft shadows — never both heavy.
- Density: fewer visual dividers, more spacing; tables use subtle row separators, no zebra striping.
- Motion: subtle only (150–200ms ease transitions on hover/expand); no bouncy animations.
- Icons: thin-stroke (lucide), monochrome, small.
- Charts: desaturated palette, no chart borders, minimal gridlines, clean axis labels.
- Data tables stay compact and dense — minimalism comes from removing visual noise, not adding padding.
- Semantic status colors (red overdue, yellow due-soon, green paid/delivered) stay clearly distinguishable, just desaturated to fit the palette.