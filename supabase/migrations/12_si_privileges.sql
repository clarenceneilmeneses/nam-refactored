-- ============================================================
-- NAM Supply — SI # workflow: privileges + enforcement
-- Run AFTER 11_si_review.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- 11_si_review.sql added the storage and left the rules to the app UI.
-- This file moves the rules into the database and makes them assignable,
-- replacing the hardcoded user ids the app used to carry:
--
--   enter_si   fill in / change a record's SI #
--   review_si  mark an SI # reviewed
--   mark_paid  change a record's Paid status (only once si_reviewed)
--
-- Granted PER PERSON, not per role: Ms. Allyson Ashley Aguilera (users.id 6)
-- and Ms. Jessel Rose Genotiva (18) both sit on the Super Admin role, which
-- ~10 accounts share, so a role-level grant would hand these to every Super
-- Admin — exactly what the rules exist to prevent. Super Admin therefore does
-- NOT inherit them; only an explicit grant does. Reassign in the Roles tab.
--
-- NOTE: has_permission()/has_privilege() calls inside a policy are wrapped in
-- (SELECT ...) so Postgres evaluates them once per statement (InitPlan)
-- instead of once per row — same reason as 03_auth_rls.sql.
-- ============================================================

BEGIN;

-- 1. Per-person grants -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_privileges (
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  privilege  text        NOT NULL CHECK (privilege IN ('enter_si', 'review_si', 'mark_paid')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by integer     REFERENCES users(id),
  PRIMARY KEY (user_id, privilege)
);

COMMENT ON TABLE user_privileges IS
  'Privileges that a role cannot express because they must apply to one person, not to everyone sharing their role. Managed in the Roles tab.';

ALTER TABLE user_privileges ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read grants: the app resolves its own privileges from
-- this table on load, and the Roles tab renders the full assignment matrix.
DROP POLICY IF EXISTS "user_privileges read"  ON user_privileges;
DROP POLICY IF EXISTS "user_privileges write" ON user_privileges;
CREATE POLICY "user_privileges read" ON user_privileges FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "user_privileges write" ON user_privileges FOR ALL TO authenticated
  USING ((SELECT has_permission('manage_users')))
  WITH CHECK ((SELECT has_permission('manage_users')));

-- 2. Privilege helper --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_privilege(p_privilege text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_privileges up
    JOIN users u ON u.id = up.user_id
    WHERE u.auth_id = auth.uid() AND up.privilege = p_privilege
  );
$$;

REVOKE ALL ON FUNCTION public.has_privilege(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_privilege(text) TO authenticated;

-- 3. Seed the current holders ------------------------------------------------
-- Verified against production: 6 = "ally" (Ms. Allyson Ashley Aguilera),
-- 18 = "jessel" (Ms. Jessel Rose Genotiva). Joined against users so a wrong id
-- is skipped rather than failing — the check at the bottom catches that.
INSERT INTO user_privileges (user_id, privilege)
SELECT u.id, v.privilege
FROM (VALUES (6, 'enter_si'), (18, 'review_si'), (18, 'mark_paid')) AS v(user_id, privilege)
JOIN users u ON u.id = v.user_id
ON CONFLICT DO NOTHING;

-- 4. Grandfather already-Paid records ----------------------------------------
-- 11_si_review.sql added si_reviewed as NOT NULL DEFAULT false, so every row
-- that predates it reads "unreviewed" — including ~1,477 already-Paid records.
-- Closed business stays closed: anything already Paid counts as reviewed.
-- Everything else must go through the reviewer from now on.
UPDATE sales SET si_reviewed = true
WHERE payment_status = 'Paid' AND si_reviewed = false;

-- 5. Enforce the rules -------------------------------------------------------
-- A trigger, not an RLS policy: these are transition rules (who may move a
-- record INTO Paid) and they need to compare OLD to NEW. An RLS WITH CHECK only
-- sees the new row, so "payment_status <> 'Paid' OR has_privilege(...)" would
-- also block everyone else from editing an already-Paid record's remarks.
CREATE OR REPLACE FUNCTION public.enforce_si_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_paid boolean := coalesce(NEW.payment_status, '') = 'Paid';
  v_old_paid boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- deliver_items does not copy si_number onto the remainder row when it
    -- splits a partial delivery, so gating this is safe. Bulk imports that
    -- carry SI #s must be run by someone holding enter_si.
    IF coalesce(NEW.si_number, '') <> '' AND NOT has_privilege('enter_si') THEN
      RAISE EXCEPTION 'Only the assigned SI encoder can set a record''s SI #.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.si_reviewed AND NOT has_privilege('review_si') THEN
      RAISE EXCEPTION 'Only the assigned SI reviewer can mark an SI # reviewed.'
        USING ERRCODE = '42501';
    END IF;
    IF v_new_paid AND NOT has_privilege('mark_paid') THEN
      RAISE EXCEPTION 'Only the assigned SI reviewer can create a record as Paid.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE from here down.

  -- SI # entry belongs to the encoder alone.
  IF NEW.si_number IS DISTINCT FROM OLD.si_number THEN
    IF NOT has_privilege('enter_si') THEN
      RAISE EXCEPTION 'Only the assigned SI encoder can change a record''s SI #.'
        USING ERRCODE = '42501';
    END IF;
    -- A changed SI # invalidates any prior review.
    NEW.si_reviewed    := false;
    NEW.si_reviewed_by := NULL;
    NEW.si_reviewed_at := NULL;
  END IF;

  -- Marking an SI # reviewed belongs to the reviewer alone. Stamped here so the
  -- audit fields can't be forged by the client.
  IF NEW.si_reviewed AND NOT OLD.si_reviewed THEN
    IF NOT has_privilege('review_si') THEN
      RAISE EXCEPTION 'Only the assigned SI reviewer can mark an SI # reviewed.'
        USING ERRCODE = '42501';
    END IF;
    NEW.si_reviewed_by := (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1);
    NEW.si_reviewed_at := now();
  END IF;

  -- Paid is the reviewer's call in both directions: reverting it unwinds their
  -- approval. Only an actual transition is gated, so unrelated edits to an
  -- already-Paid record (remarks, due date, a delivery stamping due_date across
  -- a PO group) still go through untouched.
  v_old_paid := coalesce(OLD.payment_status, '') = 'Paid';
  IF v_new_paid IS DISTINCT FROM v_old_paid THEN
    IF NOT has_privilege('mark_paid') THEN
      RAISE EXCEPTION 'Only the assigned SI reviewer can change a record''s Paid status.'
        USING ERRCODE = '42501';
    END IF;
    IF v_new_paid AND NOT NEW.si_reviewed THEN
      RAISE EXCEPTION 'This record''s SI # must be reviewed before it can be marked Paid.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_si_privileges ON sales;
CREATE TRIGGER sales_si_privileges
  BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_si_privileges();

COMMIT;

-- ============================================================
-- Check the result. The first query must return exactly three rows naming
-- ally (enter_si) and jessel (review_si, mark_paid) — if it comes back short,
-- the ids above are wrong and NOBODY can mark records Paid.
--
--   SELECT up.privilege, u.id, u.username, u.full_name
--     FROM user_privileges up JOIN users u ON u.id = up.user_id
--    ORDER BY up.privilege, u.id;
--
-- Expect reviewed = 1477 (the grandfathered Paid records), and every
-- already-Paid record reviewed:
--
--   SELECT si_reviewed, count(*) FROM sales GROUP BY si_reviewed;
--   SELECT count(*) FROM sales WHERE payment_status = 'Paid' AND NOT si_reviewed; -- 0
-- ============================================================
