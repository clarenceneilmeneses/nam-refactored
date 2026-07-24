-- ============================================================
-- NAM Supply — Delivery Receipt (DR) # + what a Legacy Restore keeps
-- Run AFTER 21_clients_conforme.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- Two changes that belong together:
--
-- 1. sales.dr_number — the Delivery Receipt number, shown next to the SI #.
--    A DR is issued when goods leave, so deliver_items can stamp one on the
--    whole delivery instead of the encoder typing it per line item.
--
-- 2. legacy_restore_commit now keeps THREE kinds of local work across a
--    refresh, not one. The restore truncates sales and reloads it from the old
--    system's dump, so anything this system knows that the dump does not is
--    lost unless it is snapshotted and re-applied:
--      * SI review state  (already kept before this migration)
--      * Paid + date paid (NEW — was silently reverted to the dump's status)
--      * DR #             (NEW — the dump has no such column at all)
--
--    Paid is re-applied ONE WAY: a Paid mark made here survives the refresh,
--    but the dump can never un-pay a record. Settled business stays settled
--    from either side — the same principle as the grandfathering below.
--
--    Rows are matched back by id AND an order fingerprint (date, company,
--    item, qty). Id alone is not safe: both systems hand out ids from the same
--    counter, so while they run side by side they can assign the SAME id to
--    DIFFERENT records, and matching on id alone would move one record's
--    payment state onto another's. A row whose fingerprint no longer matches
--    is reported as lost rather than guessed at — see local_only_rows_lost in
--    the return value, which the Import page shows the operator.
-- ============================================================

BEGIN;

-- 1. The column ---------------------------------------------------------------
ALTER TABLE sales ADD COLUMN IF NOT EXISTS dr_number text;

COMMENT ON COLUMN sales.dr_number IS
  'Delivery Receipt number. Exists only in this system — no legacy dump carries it, so legacy_restore_commit re-applies it after a refresh.';

-- 2. deliver_items: stamp the DR # on what actually shipped --------------------
-- Unchanged signature; p_items entries may now carry an optional "dr_number".
-- Only the delivered row gets it. A partial delivery's remainder clone stays
-- NULL on purpose: it has not shipped, so it will have its own DR later.
CREATE OR REPLACE FUNCTION public.deliver_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it        jsonb;
  s         sales;
  v_id      integer;
  v_deliver integer;
  v_dr      text;
  v_qty     integer;
  v_rest    integer;
  v_rest_id integer;
  v_wht_del numeric;
  v_wht_rest numeric;
  v_due     date;
  v_pending integer;
  v_today   date := (now() AT TIME ZONE 'Asia/Manila')::date;
  results   jsonb := '[]'::jsonb;
BEGIN
  IF NOT (has_permission('manage_sales') OR has_permission('view_logistics')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to deliver';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_id      := (it->>'id')::integer;
    v_deliver := coalesce((it->>'deliver_qty')::integer, 0);
    v_dr      := nullif(btrim(coalesce(it->>'dr_number', '')), '');

    SELECT * INTO s FROM sales WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale % not found', v_id;
    END IF;
    IF s.date_delivered IS NOT NULL THEN
      RAISE EXCEPTION 'Sale % is already delivered', v_id;
    END IF;
    v_qty := coalesce(s.quantity_requested, 0);
    IF v_deliver < 1 OR v_deliver > v_qty THEN
      RAISE EXCEPTION 'Invalid deliver quantity % for sale % (pending %)', v_deliver, v_id, v_qty;
    END IF;

    v_rest    := v_qty - v_deliver;
    v_rest_id := NULL;

    IF v_rest > 0 THEN
      -- Split the withholding tax pro-rata so both parts sum to the original.
      v_wht_del  := round(coalesce(s.withholding_tax, 0) * v_deliver / v_qty, 2);
      v_wht_rest := round(coalesce(s.withholding_tax, 0) - v_wht_del, 2);

      -- Clone: same order details, remainder quantity, still pending.
      -- dr_number is deliberately absent: the remainder has not shipped.
      INSERT INTO sales
        (date, sn, po_number, company, category, item, quantity_requested,
         suppliers_price, total_actual_amount, nam_unit_price, total_nam_amount,
         income, income_percent, date_delivered, payment_term, due_date,
         payment_status, buyer, remarks, supplier, address, tin,
         contact_person_contact, is_reserved, withholding_tax, total_amount_due)
      VALUES
        (s.date, s.sn, s.po_number, s.company, s.category, s.item, v_rest,
         s.suppliers_price,
         round(v_rest * coalesce(s.suppliers_price, 0), 2),
         s.nam_unit_price,
         round(v_rest * coalesce(s.nam_unit_price, 0), 2),
         round(v_rest * (coalesce(s.nam_unit_price, 0) - coalesce(s.suppliers_price, 0)), 2),
         CASE WHEN coalesce(s.nam_unit_price, 0) > 0
              THEN round((coalesce(s.nam_unit_price, 0) - coalesce(s.suppliers_price, 0))
                         / coalesce(s.nam_unit_price, 0) * 100, 2)
              ELSE 0 END,
         NULL, s.payment_term, NULL,
         'Pending', s.buyer, s.remarks, s.supplier, s.address, s.tin,
         s.contact_person_contact, s.is_reserved, v_wht_rest,
         round(v_rest * coalesce(s.nam_unit_price, 0), 2) - v_wht_rest)
      RETURNING id INTO v_rest_id;

      -- Original row becomes the delivered part.
      UPDATE sales SET
        quantity_requested  = v_deliver,
        total_actual_amount = round(v_deliver * coalesce(suppliers_price, 0), 2),
        total_nam_amount    = round(v_deliver * coalesce(nam_unit_price, 0), 2),
        income              = round(v_deliver * (coalesce(nam_unit_price, 0) - coalesce(suppliers_price, 0)), 2),
        income_percent      = CASE WHEN coalesce(nam_unit_price, 0) > 0
                                   THEN round((coalesce(nam_unit_price, 0) - coalesce(suppliers_price, 0))
                                              / coalesce(nam_unit_price, 0) * 100, 2)
                                   ELSE 0 END,
        withholding_tax     = v_wht_del,
        total_amount_due    = round(v_deliver * coalesce(nam_unit_price, 0), 2) - v_wht_del,
        date_delivered      = v_today,
        dr_number           = coalesce(v_dr, dr_number)
      WHERE id = v_id;
    ELSE
      UPDATE sales SET
        date_delivered = v_today,
        dr_number      = coalesce(v_dr, dr_number)
      WHERE id = v_id;
    END IF;

    -- Due-date timer: stamp the whole PO group once nothing is pending,
    -- or just this row when it has no PO.
    v_due := NULL;
    IF coalesce(trim(s.po_number), '') = '' THEN
      v_due := v_today + payment_term_days(s.payment_term);
      UPDATE sales SET due_date = v_due WHERE id = v_id;
    ELSE
      SELECT count(*) INTO v_pending FROM sales
      WHERE po_number = s.po_number
        AND company IS NOT DISTINCT FROM s.company
        AND date_delivered IS NULL;
      IF v_pending = 0 THEN
        v_due := v_today + payment_term_days(s.payment_term);
        UPDATE sales SET due_date = v_due
        WHERE po_number = s.po_number
          AND company IS NOT DISTINCT FROM s.company;
      END IF;
    END IF;

    results := results || jsonb_build_object(
      'id',            v_id,
      'item',          s.item,
      'company',       s.company,
      'po_number',     s.po_number,
      'dr_number',     v_dr,
      'original_qty',  v_qty,
      'delivered_qty', v_deliver,
      'remainder_id',  v_rest_id,
      'remainder_qty', v_rest,
      'due_date',      v_due);
  END LOOP;

  RETURN results;
END;
$$;

-- 3. legacy_restore_commit: keep Paid and DR # too -----------------------------
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
  v_paid_kept     bigint := 0;
  v_dr_kept       bigint := 0;
  v_lost          bigint := 0;
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
    -- Everything this system knows that the old one cannot tell us: the SI
    -- review, the Paid mark, the DR #. Carried across the reload together.
    CREATE TEMP TABLE _prev_sales_local ON COMMIT DROP AS
      SELECT id, date, company, item, quantity_requested,
             si_number, si_reviewed, si_reviewed_by, si_reviewed_at,
             payment_status, date_paid, dr_number
      FROM public.sales
      WHERE si_reviewed
         OR coalesce(payment_status, '') = 'Paid'
         OR coalesce(dr_number, '') <> '';
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
      -- dr_number, contact_details, …) falls back to its column default.
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
    -- Match the snapshot back onto the reloaded rows ONCE. The fingerprint is
    -- what makes this safe: an id the old system has since handed to a
    -- different record will not match, so no record inherits another's
    -- payment state. Quantities are part of it, so a row the old system
    -- split after the snapshot drops out and is reported instead of guessed.
    CREATE TEMP TABLE _prev_matched ON COMMIT DROP AS
      SELECT p.*
      FROM _prev_sales_local p
      JOIN public.sales s
        ON  s.id                 =                  p.id
        AND s.date               IS NOT DISTINCT FROM p.date
        AND s.company            IS NOT DISTINCT FROM p.company
        AND s.item               IS NOT DISTINCT FROM p.item
        AND s.quantity_requested IS NOT DISTINCT FROM p.quantity_requested;

    SELECT count(*) INTO v_lost
    FROM _prev_sales_local p
    WHERE NOT EXISTS (SELECT 1 FROM _prev_matched m WHERE m.id = p.id);

    -- 1. SI review, as before.
    UPDATE public.sales s
    SET si_reviewed = true, si_reviewed_by = m.si_reviewed_by, si_reviewed_at = m.si_reviewed_at
    FROM _prev_matched m
    WHERE s.id = m.id
      AND m.si_reviewed
      AND coalesce(s.si_number, '') = coalesce(m.si_number, '');
    GET DIAGNOSTICS v_preserved = ROW_COUNT;

    -- 2. Paid, one way only. Never the reverse: the dump cannot un-pay a
    -- record that was settled here.
    UPDATE public.sales s
    SET payment_status = 'Paid',
        date_paid      = coalesce(s.date_paid, m.date_paid)
    FROM _prev_matched m
    WHERE s.id = m.id
      AND coalesce(m.payment_status, '') = 'Paid'
      AND coalesce(s.payment_status, '') <> 'Paid';
    GET DIAGNOSTICS v_paid_kept = ROW_COUNT;

    -- 3. DR #. No dump carries the column, so the reloaded row is always NULL
    -- here — there is nothing to merge with, only to restore.
    UPDATE public.sales s
    SET dr_number = m.dr_number
    FROM _prev_matched m
    WHERE s.id = m.id
      AND coalesce(m.dr_number, '') <> ''
      AND s.dr_number IS NULL;
    GET DIAGNOSTICS v_dr_kept = ROW_COUNT;

    -- Same rule as 12_si_privileges.sql: anything already marked Paid is
    -- closed business and counts as reviewed. Runs last so the rows just
    -- re-paid above are covered by it too.
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
          (SELECT string_agg(k || '=' || (v_counts ->> k), ', ' ORDER BY k) FROM jsonb_object_keys(v_counts) k) ||
          CASE WHEN v_lost > 0 THEN format('; %s local row(s) had no match in the dump', v_lost) ELSE '' END);

  RETURN jsonb_build_object(
    'tables', v_counts,
    'si_review_preserved', v_preserved,
    'si_paid_grandfathered', v_grandfathered,
    'paid_preserved', v_paid_kept,
    'dr_preserved', v_dr_kept,
    'local_only_rows_lost', v_lost
  );
END;
$$;

COMMIT;

-- Sanity checks after running:
--   SELECT count(*) FROM sales WHERE dr_number IS NOT NULL;              -- 0 on a fresh run
--   SELECT count(*) FROM sales WHERE payment_status = 'Paid' AND NOT si_reviewed;  -- 0
