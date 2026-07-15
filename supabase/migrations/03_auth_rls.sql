-- ============================================================
-- NAM Supply — Auth link + RLS policies
-- Run AFTER 01_schema.sql and 02_data.sql, in the Supabase SQL Editor.
-- Safe to re-run: drops existing policies first.
--
-- NOTE: every has_permission()/auth.uid() call in a policy is wrapped in
-- (SELECT ...) so Postgres evaluates it ONCE per statement (InitPlan)
-- instead of once per row. Without the wrapper, scanning a large table
-- (system_logs) re-runs the permission join per row and hits Supabase's
-- statement timeout.
-- ============================================================

-- 1. Link legacy users to Supabase Auth ------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE REFERENCES auth.users(id);

-- After creating each person in Authentication → Users, link them:
--   UPDATE users SET auth_id = '<uuid-from-auth-dashboard>' WHERE username = 'roland';
-- Once every active user is linked, drop the legacy columns:
--   ALTER TABLE users DROP COLUMN IF EXISTS password, DROP COLUMN IF EXISTS session_token;

-- 2. Permission helper -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN role_permissions rp ON rp.role_id = u.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE u.auth_id = auth.uid() AND p.name = perm
  );
$$;

-- 3. Policies ----------------------------------------------------------------
-- sales: dashboard/finance viewers and logistics can read; only manage_sales writes.
DROP POLICY IF EXISTS "sales read"   ON sales;
DROP POLICY IF EXISTS "sales insert" ON sales;
DROP POLICY IF EXISTS "sales update" ON sales;
DROP POLICY IF EXISTS "sales delete" ON sales;
CREATE POLICY "sales read" ON sales FOR SELECT TO authenticated
  USING ((SELECT has_permission('view_dashboard')) OR (SELECT has_permission('manage_sales'))
      OR (SELECT has_permission('view_logistics')) OR (SELECT has_permission('manage_finance')));
CREATE POLICY "sales insert" ON sales FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('manage_sales')));
CREATE POLICY "sales update" ON sales FOR UPDATE TO authenticated
  USING ((SELECT has_permission('manage_sales')) OR (SELECT has_permission('view_logistics')) OR (SELECT has_permission('manage_finance')))
  WITH CHECK ((SELECT has_permission('manage_sales')) OR (SELECT has_permission('view_logistics')) OR (SELECT has_permission('manage_finance')));
CREATE POLICY "sales delete" ON sales FOR DELETE TO authenticated
  USING ((SELECT has_permission('manage_sales')));

-- quotations: sales staff only.
DROP POLICY IF EXISTS "quotations all" ON quotations;
CREATE POLICY "quotations all" ON quotations FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_sales'))) WITH CHECK ((SELECT has_permission('manage_sales')));

-- products: anyone signed in can read (needed for autocomplete); manage_products writes.
DROP POLICY IF EXISTS "products read"  ON products;
DROP POLICY IF EXISTS "products write" ON products;
CREATE POLICY "products read" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products write" ON products FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_products'))) WITH CHECK ((SELECT has_permission('manage_products')));

-- clients: readable by sales/dashboard users; writable by sales staff.
DROP POLICY IF EXISTS "clients read"  ON clients;
DROP POLICY IF EXISTS "clients write" ON clients;
CREATE POLICY "clients read" ON clients FOR SELECT TO authenticated
  USING ((SELECT has_permission('view_dashboard')) OR (SELECT has_permission('manage_sales')));
CREATE POLICY "clients write" ON clients FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_sales'))) WITH CHECK ((SELECT has_permission('manage_sales')));

-- company_assignments: same as clients.
DROP POLICY IF EXISTS "company_assignments read"  ON company_assignments;
DROP POLICY IF EXISTS "company_assignments write" ON company_assignments;
CREATE POLICY "company_assignments read" ON company_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_assignments write" ON company_assignments FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_sales'))) WITH CHECK ((SELECT has_permission('manage_sales')));

-- users: self-read (for the profile lookup) or admins; only admins manage.
DROP POLICY IF EXISTS "users self read" ON users;
DROP POLICY IF EXISTS "users manage"    ON users;
CREATE POLICY "users self read" ON users FOR SELECT TO authenticated
  USING (auth_id = (SELECT auth.uid()) OR (SELECT has_permission('manage_users')));
CREATE POLICY "users manage" ON users FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_users'))) WITH CHECK ((SELECT has_permission('manage_users')));

-- roles / permissions / role_permissions: readable by all signed-in users
-- (the app resolves its own permissions from these); writable by admins.
DROP POLICY IF EXISTS "roles read"   ON roles;
DROP POLICY IF EXISTS "roles write"  ON roles;
CREATE POLICY "roles read" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles write" ON roles FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_users'))) WITH CHECK ((SELECT has_permission('manage_users')));

DROP POLICY IF EXISTS "permissions read"  ON permissions;
DROP POLICY IF EXISTS "permissions write" ON permissions;
CREATE POLICY "permissions read" ON permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "permissions write" ON permissions FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_users'))) WITH CHECK ((SELECT has_permission('manage_users')));

DROP POLICY IF EXISTS "role_permissions read"  ON role_permissions;
DROP POLICY IF EXISTS "role_permissions write" ON role_permissions;
CREATE POLICY "role_permissions read" ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions write" ON role_permissions FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_users'))) WITH CHECK ((SELECT has_permission('manage_users')));

-- system_logs: any signed-in user may append; only admins read.
DROP POLICY IF EXISTS "logs insert" ON system_logs;
DROP POLICY IF EXISTS "logs read"   ON system_logs;
CREATE POLICY "logs insert" ON system_logs FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "logs read" ON system_logs FOR SELECT TO authenticated
  USING ((SELECT has_permission('manage_users')));

-- 4. Realtime (dashboard live updates) ---------------------------------------
-- Adds sales to the realtime publication if it isn't already there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sales'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  END IF;
END $$;

-- 5. Optional: assign manage_finance (permission 6) to Super Admin + Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, 6 FROM roles r WHERE r.name IN ('Super Admin', 'Admin')
ON CONFLICT DO NOTHING;
