-- ============================================================
-- NAM Supply — In-app legacy dump restore (Import page → Legacy Restore)
-- Run AFTER 17_signer_profile.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- Replaces the manual refresh loop (convert-mysql-dump.cjs → part files →
-- SQL editor) with three RPCs the app calls itself. A Super Admin drops the
-- raw Hostinger/phpMyAdmin .sql dump on the Import page; the browser parses
-- it (same conversion rules as the script) and then:
--
--   legacy_restore_begin()                    clear the staging area
--   legacy_restore_stage(table, cols, rows)   upload rows in batches (jsonb)
--   legacy_restore_commit(tables[])           ONE transaction: truncate the
--                                             chosen live tables, load staged
--                                             rows, resync id sequences,
--                                             re-apply SI review state, log it
--
-- Because commit is a single function call, the swap is atomic: the live
-- tables are never left half-loaded — either the whole refresh lands or
-- nothing changes.
--
-- SI review survives a refresh: si_reviewed/by/at exist only in this system
-- (the old system knows nothing about them), so commit snapshots them before
-- the truncate and restores them onto rows whose id + SI # still match, then
-- re-grandfathers Paid rows (closed business stays closed — same rule as
-- 12_si_privileges.sql). The sales_si_privileges trigger is disabled for the
-- duration of the load; legacy rows legitimately arrive with SI #s and Paid
-- statuses that the trigger would otherwise reject.
-- ============================================================

BEGIN;

-- 1. Staging area -------------------------------------------------------------
-- A real table (not TEMP): batches arrive over separate HTTP calls.
CREATE TABLE IF NOT EXISTS legacy_restore_staging (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text        NOT NULL,
  columns    text[]      NOT NULL,
  rows       jsonb       NOT NULL,
  staged_by  uuid        NOT NULL DEFAULT auth.uid(),
  staged_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legacy_restore_staging IS
  'Scratch space for the Import page''s Legacy Restore. Only touched through the legacy_restore_* RPCs; safe to truncate any time.';

-- No direct client access at all — reads/writes go through the RPCs below.
ALTER TABLE legacy_restore_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE legacy_restore_staging FROM public, anon, authenticated;

-- 2. Guard --------------------------------------------------------------------
-- The Import page is Super Admin (role id 1) only; the RPCs enforce the same.
CREATE OR REPLACE FUNCTION public.assert_legacy_restore_allowed()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role_id = 1) THEN
    RAISE EXCEPTION 'Only a Super Admin can restore legacy data' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- The only tables a restore may touch. users/roles/permissions/user_privileges
-- are deliberately absent: logins and grants belong to this system now.
CREATE OR REPLACE FUNCTION public.legacy_restore_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['products', 'clients', 'company_assignments', 'quotations', 'sales', 'system_logs'];
$$;

-- 3. begin: clear the staging area -------------------------------------------
CREATE OR REPLACE FUNCTION public.legacy_restore_begin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_legacy_restore_allowed();
  -- TRUNCATE, not DELETE: pg-safeupdate runs on API sessions and rejects
  -- an unqualified DELETE even inside a SECURITY DEFINER function.
  TRUNCATE TABLE legacy_restore_staging;
END;
$$;

-- 4. stage: upload one batch of rows for one table ---------------------------
-- p_rows is a jsonb array of objects keyed by column name; values are JSON
-- scalars whose text form Postgres can cast to the column type (the browser
-- already normalized zero-dates to null, 0/1 flags to booleans, and tagged
-- legacy timestamps with +08). Returns the total rows staged for the table.
CREATE OR REPLACE FUNCTION public.legacy_restore_stage(p_table text, p_columns text[], p_rows jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bad   text;
  v_total bigint;
BEGIN
  PERFORM assert_legacy_restore_allowed();

  IF NOT p_table = ANY (legacy_restore_tables()) THEN
    RAISE EXCEPTION 'Table % cannot be restored', p_table;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  -- Every staged column must exist on the live table (also keeps the dynamic
  -- SQL in commit honest — column names come from here, quoted).
  SELECT c INTO v_bad
  FROM unnest(p_columns) AS c
  WHERE c NOT IN (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table
  )
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Column % does not exist on % — the dump may be newer than this schema', v_bad, p_table;
  END IF;

  INSERT INTO legacy_restore_staging (table_name, columns, rows) VALUES (p_table, p_columns, p_rows);

  SELECT COALESCE(sum(jsonb_array_length(rows)), 0) INTO v_total
  FROM legacy_restore_staging WHERE table_name = p_table;
  RETURN v_total;
END;
$$;

-- 5. commit: the atomic swap --------------------------------------------------
-- Only tables listed in p_tables are replaced; each must have staged rows.
-- Returns a summary the app shows the user, e.g.
-- {"tables":{"sales":12345,...},"si_review_preserved":210,"si_paid_grandfathered":37}
CREATE OR REPLACE FUNCTION public.legacy_restore_commit(p_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table         text;
  v_batch         record;
  v_collist       text;
  v_selectlist    text;
  v_count         bigint;
  v_max           bigint;
  v_counts        jsonb := '{}'::jsonb;
  v_preserved     bigint := 0;
  v_grandfathered bigint := 0;
  v_user_id       integer;
BEGIN
  PERFORM assert_legacy_restore_allowed();
  SELECT id INTO v_user_id FROM users WHERE auth_id = auth.uid();

  IF p_tables IS NULL OR array_length(p_tables, 1) IS NULL THEN
    RAISE EXCEPTION 'No tables selected';
  END IF;
  FOREACH v_table IN ARRAY p_tables LOOP
    IF NOT v_table = ANY (legacy_restore_tables()) THEN
      RAISE EXCEPTION 'Table % cannot be restored', v_table;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM legacy_restore_staging WHERE table_name = v_table) THEN
      RAISE EXCEPTION 'No staged rows for % — upload the dump again', v_table;
    END IF;
  END LOOP;

  IF 'sales' = ANY (p_tables) THEN
    -- Review state exists only in this system; carry it across the reload.
    CREATE TEMP TABLE _prev_si_review ON COMMIT DROP AS
      SELECT id, si_number, si_reviewed_by, si_reviewed_at
      FROM public.sales WHERE si_reviewed;
    -- Legacy rows arrive with SI #s and Paid statuses the trigger would block.
    ALTER TABLE public.sales DISABLE TRIGGER sales_si_privileges;
  END IF;

  FOREACH v_table IN ARRAY p_tables LOOP
    EXECUTE format('TRUNCATE TABLE public.%I', v_table);
    v_count := 0;
    FOR v_batch IN
      SELECT columns, rows FROM legacy_restore_staging
      WHERE table_name = v_table ORDER BY id
    LOOP
      SELECT string_agg(quote_ident(c), ', '), string_agg('t.' || quote_ident(c), ', ')
      INTO v_collist, v_selectlist
      FROM unnest(v_batch.columns) AS c;
      -- Explicit column list: anything the dump doesn't carry (si_reviewed,
      -- contact_details, …) falls back to its column default.
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) AS t',
        v_table, v_collist, v_selectlist, v_table
      ) USING v_batch.rows;
      v_count := v_count + jsonb_array_length(v_batch.rows);
    END LOOP;
    -- Dump rows carry their legacy ids; move the identity sequence past them.
    EXECUTE format('SELECT COALESCE(MAX(id), 1) FROM public.%I', v_table) INTO v_max;
    PERFORM setval(pg_get_serial_sequence('public.' || quote_ident(v_table), 'id'), v_max);
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  END LOOP;

  IF 'sales' = ANY (p_tables) THEN
    UPDATE public.sales s
    SET si_reviewed = true, si_reviewed_by = p.si_reviewed_by, si_reviewed_at = p.si_reviewed_at
    FROM _prev_si_review p
    WHERE s.id = p.id AND coalesce(s.si_number, '') = coalesce(p.si_number, '');
    GET DIAGNOSTICS v_preserved = ROW_COUNT;

    -- Same rule as 12_si_privileges.sql: anything the old system already
    -- marked Paid is closed business and counts as reviewed.
    UPDATE public.sales SET si_reviewed = true
    WHERE payment_status = 'Paid' AND NOT si_reviewed;
    GET DIAGNOSTICS v_grandfathered = ROW_COUNT;

    ALTER TABLE public.sales ENABLE TRIGGER sales_si_privileges;
  END IF;

  TRUNCATE TABLE legacy_restore_staging;

  -- Written after the reload so the entry survives a system_logs refresh.
  INSERT INTO system_logs (user_id, action, description)
  VALUES (v_user_id, 'Restored Legacy Data',
          'Restored from old-system dump: ' ||
          (SELECT string_agg(k || '=' || (v_counts ->> k), ', ' ORDER BY k) FROM jsonb_object_keys(v_counts) k));

  RETURN jsonb_build_object(
    'tables', v_counts,
    'si_review_preserved', v_preserved,
    'si_paid_grandfathered', v_grandfathered
  );
END;
$$;

-- 6. Lock down ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assert_legacy_restore_allowed() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.legacy_restore_begin() FROM public, anon;
REVOKE ALL ON FUNCTION public.legacy_restore_stage(text, text[], jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.legacy_restore_commit(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.legacy_restore_begin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_restore_stage(text, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_restore_commit(text[]) TO authenticated;

COMMIT;
