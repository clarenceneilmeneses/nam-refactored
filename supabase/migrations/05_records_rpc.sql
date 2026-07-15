-- ============================================================
-- NAM Supply — Sales Records delivery RPC
-- Run AFTER 01_schema.sql … 04_quotations_rpc.sql in the
-- Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE).
--
-- deliver_items(jsonb) is the single delivery entry point used by
-- both the Records page (bulk / partial delivery) and the Logistics
-- page (single full delivery), matching legacy mark_delivered.php:
--   * partial quantities SPLIT the row: the original becomes the
--     delivered part, a cloned row keeps the pending remainder
--   * once a (po_number, company) group has zero undelivered rows,
--     due_date = today + payment-term days is stamped on the whole
--     group (or on the row alone when it has no PO)
-- SECURITY DEFINER guarded by manage_sales OR view_logistics so
-- drivers can deliver without full sales rights.
-- ============================================================

-- Payment-term parser: first number in the string = days,
-- "COD"/"CASH" = 0, empty/unparseable = 30 (legacy behaviour).
CREATE OR REPLACE FUNCTION public.payment_term_days(p_term text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_term ~ '\d' THEN (regexp_match(p_term, '\d+'))[1]::integer
    WHEN p_term ILIKE '%cod%' OR p_term ILIKE '%cash%' THEN 0
    ELSE 30
  END;
$$;

-- p_items: [{ "id": int, "deliver_qty": int }, ...]
-- Returns a jsonb array (one entry per input item) the client uses
-- for system_logs entries:
--   [{ id, item, company, po_number, original_qty, delivered_qty,
--      remainder_id, remainder_qty, due_date }, ...]
CREATE OR REPLACE FUNCTION public.deliver_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it        jsonb;
  s         sales;
  v_id      integer;
  v_deliver integer;
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
        date_delivered      = v_today
      WHERE id = v_id;
    ELSE
      UPDATE sales SET date_delivered = v_today WHERE id = v_id;
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
      'original_qty',  v_qty,
      'delivered_qty', v_deliver,
      'remainder_id',  v_rest_id,
      'remainder_qty', v_rest,
      'due_date',      v_due);
  END LOOP;

  RETURN results;
END;
$$;

-- Lock the functions down to signed-in users.
REVOKE ALL ON FUNCTION public.payment_term_days(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.deliver_items(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.payment_term_days(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_items(jsonb) TO authenticated;
