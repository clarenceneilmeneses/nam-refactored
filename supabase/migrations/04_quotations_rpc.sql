-- ============================================================
-- NAM Supply — Quotations workflow RPCs
-- Run AFTER 01_schema.sql, 02_data.sql and 03_auth_rls.sql,
-- in the Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE).
--
-- These functions keep the stock-sensitive quotation operations
-- atomic (one transaction each), matching legacy quotations.php:
--   create_quotation_batch  – save the Draft Workspace queue and
--                             auto-create unknown items as draft products
--   approve_quotation       – deduct stock + set status Approved
--   finalize_quotation      – convert to a sale (+ deduct stock if needed)
--   remove_quotation_item   – delete one row, restoring stock if Approved
--   delete_quotation_group  – delete all non-Converted rows of a ref,
--                             restoring stock of Approved rows
-- All are SECURITY DEFINER guarded by has_permission('manage_sales')
-- because they must also touch products.current_stock and sales.
-- ============================================================

-- Find the product a quotation line refers to (case-insensitive name match).
CREATE OR REPLACE FUNCTION public.find_product_id(p_item text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM products WHERE lower(name) = lower(trim(p_item)) ORDER BY id LIMIT 1;
$$;

-- 1. Save a draft queue --------------------------------------------------
-- p_items: [{ "item": text, "category": text, "quantity": int,
--             "suppliers_price": numeric, "nam_unit_price": numeric }, ...]
CREATE OR REPLACE FUNCTION public.create_quotation_batch(
  p_date date,
  p_quote_ref text,
  p_company text,
  p_po_number text,
  p_payment_term text,
  p_remarks text,
  p_status text,
  p_items jsonb
) RETURNS SETOF quotations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it     jsonb;
  v_name text;
  v_cat  text;
  v_qty  integer;
  v_sup  numeric;
  v_nam  numeric;
  v_row  quotations;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_status NOT IN ('Pending', 'Reserved') THEN
    RAISE EXCEPTION 'Invalid draft status: %', p_status;
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Draft queue is empty';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_name := trim(it->>'item');
    v_cat  := coalesce(nullif(trim(it->>'category'), ''), 'Uncategorized');
    v_qty  := coalesce((it->>'quantity')::integer, 0);
    v_sup  := coalesce((it->>'suppliers_price')::numeric, 0);
    v_nam  := coalesce((it->>'nam_unit_price')::numeric, 0);
    IF v_name IS NULL OR v_name = '' THEN
      RAISE EXCEPTION 'Draft item has no name';
    END IF;

    INSERT INTO quotations
      (date, quote_ref, company, category, item, quantity_requested,
       suppliers_price, nam_unit_price, total_amount,
       po_number, payment_term, remarks, status)
    VALUES
      (p_date, p_quote_ref, p_company, v_cat, v_name, v_qty,
       v_sup, v_nam, round(v_qty * v_nam, 2),
       nullif(p_po_number, ''), nullif(p_payment_term, ''), nullif(p_remarks, ''), p_status)
    RETURNING * INTO v_row;
    RETURN NEXT v_row;

    -- Auto-create unknown items as draft products (legacy behaviour).
    IF find_product_id(v_name) IS NULL THEN
      INSERT INTO products (name, category_code, unit, supplier_price, nam_price,
                            margin, current_stock, is_draft)
      VALUES (v_name, v_cat, 'SET', v_sup, v_nam,
              CASE WHEN v_nam > 0
                   THEN round((v_nam - v_sup) / v_nam * 100, 2)::text || '%'
                   ELSE '0%' END,
              0, true);
    END IF;
  END LOOP;
  RETURN;
END;
$$;

-- 2. Approve: deduct stock, block when insufficient ----------------------
CREATE OR REPLACE FUNCTION public.approve_quotation(p_id integer)
RETURNS quotations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q     quotations;
  v_pid integer;
  v_stock integer;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO q FROM quotations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation % not found', p_id;
  END IF;
  IF coalesce(q.status, 'Pending') NOT IN ('Pending', 'Reserved') THEN
    RAISE EXCEPTION 'Only Pending or Reserved quotes can be approved';
  END IF;

  v_pid := find_product_id(q.item);
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Cannot Finalize/Approve: Insufficient Stock';
  END IF;
  SELECT current_stock INTO v_stock FROM products WHERE id = v_pid FOR UPDATE;
  IF coalesce(v_stock, 0) < coalesce(q.quantity_requested, 0) THEN
    RAISE EXCEPTION 'Cannot Finalize/Approve: Insufficient Stock';
  END IF;

  UPDATE products SET current_stock = coalesce(current_stock, 0) - coalesce(q.quantity_requested, 0)
  WHERE id = v_pid;
  UPDATE quotations SET status = 'Approved' WHERE id = p_id RETURNING * INTO q;
  RETURN q;
END;
$$;

-- 3. Finalize: convert to a sale -----------------------------------------
-- Approved quotes already deducted stock; others deduct here (same checks).
CREATE OR REPLACE FUNCTION public.finalize_quotation(p_id integer, p_date date)
RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q       quotations;
  v_pid   integer;
  v_stock integer;
  v_actual numeric;
  v_nam    numeric;
  v_income numeric;
  s       sales;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO q FROM quotations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation % not found', p_id;
  END IF;
  IF coalesce(q.status, 'Pending') = 'Converted' THEN
    RAISE EXCEPTION 'Quotation is already converted';
  END IF;

  IF coalesce(q.status, 'Pending') <> 'Approved' THEN
    v_pid := find_product_id(q.item);
    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Cannot Finalize/Approve: Insufficient Stock';
    END IF;
    SELECT current_stock INTO v_stock FROM products WHERE id = v_pid FOR UPDATE;
    IF coalesce(v_stock, 0) < coalesce(q.quantity_requested, 0) THEN
      RAISE EXCEPTION 'Cannot Finalize/Approve: Insufficient Stock';
    END IF;
    UPDATE products SET current_stock = coalesce(current_stock, 0) - coalesce(q.quantity_requested, 0)
    WHERE id = v_pid;
  END IF;

  v_actual := round(coalesce(q.quantity_requested, 0) * coalesce(q.suppliers_price, 0), 2);
  v_nam    := round(coalesce(q.quantity_requested, 0) * coalesce(q.nam_unit_price, 0), 2);
  v_income := round(v_nam - v_actual, 2);

  INSERT INTO sales
    (date, po_number, company, category, item, quantity_requested,
     suppliers_price, nam_unit_price, total_actual_amount, total_nam_amount,
     income, income_percent, withholding_tax, total_amount_due,
     payment_term, remarks, payment_status, date_delivered, due_date)
  VALUES
    (coalesce(p_date, current_date), q.po_number, q.company, q.category, q.item, q.quantity_requested,
     q.suppliers_price, q.nam_unit_price, v_actual, v_nam,
     v_income, CASE WHEN v_nam > 0 THEN round(v_income / v_nam * 100, 2) ELSE 0 END, 0, v_nam,
     q.payment_term, q.remarks, 'Pending', NULL, NULL)
  RETURNING * INTO s;

  UPDATE quotations SET status = 'Converted' WHERE id = p_id;
  RETURN s;
END;
$$;

-- 4. Remove one item, restoring stock if it was Approved -------------------
CREATE OR REPLACE FUNCTION public.remove_quotation_item(p_id integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q quotations;
  v_pid integer;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO q FROM quotations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation % not found', p_id;
  END IF;
  IF coalesce(q.status, 'Pending') = 'Converted' THEN
    RAISE EXCEPTION 'Converted quotations cannot be removed';
  END IF;
  IF q.status = 'Approved' THEN
    v_pid := find_product_id(q.item);
    IF v_pid IS NOT NULL THEN
      UPDATE products SET current_stock = coalesce(current_stock, 0) + coalesce(q.quantity_requested, 0)
      WHERE id = v_pid;
    END IF;
  END IF;
  DELETE FROM quotations WHERE id = p_id;
END;
$$;

-- 5. Delete a whole quote group (non-Converted rows only) -------------------
CREATE OR REPLACE FUNCTION public.delete_quotation_group(p_quote_ref text, p_company text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q quotations;
  v_pid integer;
  n integer := 0;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR q IN
    SELECT * FROM quotations
    WHERE quote_ref IS NOT DISTINCT FROM p_quote_ref
      AND company IS NOT DISTINCT FROM p_company
      AND coalesce(status, 'Pending') <> 'Converted'
    FOR UPDATE
  LOOP
    IF q.status = 'Approved' THEN
      v_pid := find_product_id(q.item);
      IF v_pid IS NOT NULL THEN
        UPDATE products SET current_stock = coalesce(current_stock, 0) + coalesce(q.quantity_requested, 0)
        WHERE id = v_pid;
      END IF;
    END IF;
    DELETE FROM quotations WHERE id = q.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Lock the functions down to signed-in users.
REVOKE ALL ON FUNCTION public.find_product_id(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.create_quotation_batch(date, text, text, text, text, text, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.approve_quotation(integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.finalize_quotation(integer, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.remove_quotation_item(integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.delete_quotation_group(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_product_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_batch(date, text, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_quotation(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_quotation(integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_quotation_item(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_quotation_group(text, text) TO authenticated;

-- Realtime for the quotations page (03_auth_rls.sql already added sales).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quotations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
END $$;
