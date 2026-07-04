# Task: Rebuild the Admin pages (Users, Roles, System Logs, Account-Manager Assignments) to legacy parity

Legacy source: users.php, roles.php, logs.php, assignments.php. Users/Roles/Logs are Super Admin only (role id 1); Assignments is reached from the dashboard's Company Performance "⚙ Setup" button (Super Admin only).

## Users page

- Table: ID, Username, Full Name, Role (Super Admin gets a gold 👑 crown badge; others a neutral badge; missing role → "No Role"), Created date, Actions.
- Add User modal: username, password, full name, role select (from roles table). Creates the Supabase Auth user (email = username@nam.local unless a real email is given) AND the linked row in public.users with role_id. Log "Created User".
- Edit User modal: username, full name, role, and an optional new-password field — blank keeps the old password (legacy behavior); filled resets it via the Auth admin flow. Log it.
- Delete user (confirm; block deleting yourself and the last Super Admin). Log it.

## Roles page

- Card/list per role: name, description, user count, and its permissions as small pills ("No permissions" state when empty).
- Add Role / Edit Role modal: name, description, and a checkbox per permission (view_dashboard, manage_sales, manage_products, view_logistics, manage_users, manage_finance — render from the permissions table, don't hardcode). Saving replaces the role's role_permissions set (delete-then-insert semantics). Log it.
- Delete role (confirm; block if users still assigned, or warn and null their role — match legacy: it clears role_permissions and deletes the role). Permission changes must take effect on next data fetch (RLS uses these tables — mention in a note that affected users may need to refresh).

## System Logs page

- Read-only table: Date & Time (Asia/Manila), User (full name via join, fall back to "User #id" for deleted users — 13k legacy logs reference deleted users), Action, Description, IP address (right-aligned). Newest first, paginated/virtualized (13,000+ rows), sticky header.
- Client-side text search across all columns; optional filters by user and action type.

## Assignments page (Account Managers)

- Purpose: map companies → account managers; powers the dashboard's manager chart, colors, and drilldowns.
- Form: Company select (distinct companies from sales) + Account Manager select (full names of users) → upsert into company_assignments (company_name unique; reassigning overwrites — legacy ON DUPLICATE KEY UPDATE). Success toast "Successfully assigned {company} to {manager}".
- Table of current assignments with per-row delete (unassign). "Back to Dashboard" link.
- After any change, invalidate the dashboard query so manager charts recolor immediately.

## Acceptance checklist

- A new Encoder user can log in, sees only Dashboard/Sales/Products nav, and gets database-level denial (RLS) on finance data — not just hidden buttons.
- Editing a role's permissions updates the pills and the affected users' access.
- Logs page scrolls smoothly through 13k rows and search narrows instantly; deleted-user rows still render.
- Assigning a company to Ms. Ivy recolors her bar/companies on the dashboard on next load.
