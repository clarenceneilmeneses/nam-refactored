-- ============================================================
-- NAM Supply — Sales Entry stock deduction
-- Run AFTER 04_quotations_rpc.sql, in the Supabase SQL Editor.
-- Safe to re-run (CREATE OR REPLACE).
--
-- Bug fix: "Submit as Sales" inserted straight into sales and never
-- touched products.current_stock — only the quotation path deducted.
-- create_sales_batch inserts the whole queue AND deducts stock for
-- every item that matches a product (case-insensitive name match via
-- find_product_id), in one transaction. Unknown / free-text items
-- don't deduct. Stock is allowed to go negative on purpose: the sale
-- already happened physically, so a shortfall should surface as a
-- low-stock alert on the Products tab instead of blocking the encoder.
--
-- SECURITY DEFINER guarded by has_permission('manage_sales') because
-- encoders don't hold manage_products, which products RLS requires.
-- The sales_si_privileges trigger still fires on the INSERT, so the
-- SI # rules apply here exactly as they do on a direct insert.
-- ============================================================

-- p_rows: array of sales rows as built by the Sales Entry queue
-- (same shape as a direct INSERT into sales — SaleInsert in the app).
CREATE OR REPLACE FUNCTION public.create_sales_batch(p_rows jsonb)
RETURNS SETOF sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it    jsonb;
  r     sales;
  v_row sales;
  v_pid integer;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Sales batch is empty';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    r := jsonb_populate_record(NULL::sales, it);
    IF r.item IS NULL OR trim(r.item) = '' THEN
      RAISE EXCEPTION 'Sales row has no item';
    END IF;

    INSERT INTO sales
      (date, sn, po_number, company, category, item, quantity_requested,
       suppliers_price, total_actual_amount, nam_unit_price, total_nam_amount,
       income, income_percent, date_delivered, payment_term, due_date,
       payment_status, si_number, remarks, supplier, address, tin,
       sales_invoice_no, contact_person_contact, withholding_tax, total_amount_due)
    VALUES
      (coalesce(r.date, current_date), r.sn, r.po_number, r.company, r.category,
       trim(r.item), r.quantity_requested,
       r.suppliers_price, r.total_actual_amount, r.nam_unit_price, r.total_nam_amount,
       r.income, r.income_percent, r.date_delivered, r.payment_term, r.due_date,
       coalesce(r.payment_status, 'Pending'), r.si_number, r.remarks, r.supplier, r.address, r.tin,
       r.sales_invoice_no, r.contact_person_contact,
       coalesce(r.withholding_tax, 0), coalesce(r.total_amount_due, 0))
    RETURNING * INTO v_row;
    RETURN NEXT v_row;

    v_pid := find_product_id(r.item);
    IF v_pid IS NOT NULL THEN
      UPDATE products
      SET current_stock = coalesce(current_stock, 0) - coalesce(r.quantity_requested, 0)
      WHERE id = v_pid;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_batch(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_batch(jsonb) TO authenticated;
