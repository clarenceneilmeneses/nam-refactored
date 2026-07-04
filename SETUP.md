# NAM Supply Dashboard — Setup

The frontend is complete. Three things still need **your** Supabase credentials
(they can't be done with the publishable key alone):

## 1. Load the data (if you haven't yet)

`01_schema.sql` has already been run (the tables exist). If `02_data.sql`
hasn't been loaded, run it with psql — it's too big for the SQL Editor.
Get the connection string from **Project Settings → Database** (use the
Session pooler URI if your network is IPv4-only):

```bash
psql "postgresql://postgres.kvntuqpfpjnvqvsvntdj:<DB-PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" -v ON_ERROR_STOP=1 -f ../02_data.sql
```

Sanity check in the SQL Editor:

```sql
select (select count(*) from sales)      as sales,       -- expect 2304
       (select count(*) from quotations) as quotations,  -- expect 2439
       (select count(*) from products)   as products,    -- expect 1311
       (select count(*) from users)      as users;       -- expect 19
select sum(total_nam_amount), sum(income) from sales;
-- expect 7,409,353.48 and 1,845,463.96
```

## 2. Run the RLS + auth script

Open the **SQL Editor** and run `../03_auth_rls.sql`. It adds
`users.auth_id`, the `has_permission()` helper, all row-level-security
policies, enables Realtime on `sales`, and grants `manage_finance` to
Super Admin + Admin.

Then run `../07_admin_rpc.sql` — it powers the admin Users page
(`admin_create_user` / `admin_update_user` / `admin_delete_user`
create and manage Supabase Auth logins from inside the app, which the
publishable key can't do on its own).

## 3. Create auth users and link them

For each of the 19 staff: **Authentication → Users → Add user** (email can be
synthetic, e.g. `roland@nam.local`; set a temporary password and tick
"auto-confirm"). Then link each one in the SQL Editor:

```sql
update users set auth_id = '<uuid-from-auth-dashboard>' where username = 'roland';
```

Shortcut: once `07_admin_rpc.sql` is in and *you* are linked as Super
Admin, you can skip the dashboard for everyone else — on the app's
**Users** page, edit each unlinked user and set a password; that creates
and links their `username@nam.local` login in one step.

The Users & Roles page in the app shows who is linked. Once everyone is:

```sql
alter table users drop column if exists password, drop column if exists session_token;
```

## Run the app

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # calculation unit tests (verified against real legacy rows)
npm run build      # production build → dist/
```

`.env` already contains the project URL and publishable key.

## Deploy

Vercel/Netlify: import the repo, framework = Vite, add the two `VITE_*` env
vars. Hostinger: upload `dist/` to `public_html` with this `.htaccess`:

```
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## Assumptions made (verify against the legacy app)

- **Withholding tax** is 1% of `total_nam_amount`, applied per line only when
  the checkbox is ticked; `total_amount_due = total_nam_amount − WHT`.
  Verified against migrated rows (e.g. sale #1: 1,383.75 → 13.84 → 1,369.91).
- **Product margin** = `(nam_price − supplier_price) / nam_price` (matches
  stored values like 300 → 405 = "25.93%").
- **Merge products** keeps the chosen product, adds the duplicates' stock to
  it, and deletes the duplicates.
- **Mark delivered** sets `date_delivered = today` and recomputes
  `due_date = date_delivered + payment_term days`.
- Price-list imports create unknown products as **drafts**.
- `system_logs.ip_address` is left null (browsers can't see their public IP);
  user + action + description are still recorded.
