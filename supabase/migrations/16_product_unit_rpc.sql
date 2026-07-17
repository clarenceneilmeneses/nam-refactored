-- ============================================================
-- NAM Supply — persist UOM edits from the formal quotation
-- Run AFTER 04_quotations_rpc.sql, in the Supabase SQL Editor.
-- Safe to re-run (CREATE OR REPLACE).
--
-- The quote document's UOM column now prefills from products.unit and
-- edits are saved back on print/close (like the client contact
-- details). Encoders hold manage_sales but not manage_products, which
-- products RLS requires — so the write goes through this SECURITY
-- DEFINER function, matching the quotation RPC convention. Unknown /
-- free-text items are a silent no-op.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_product_unit(p_item text, p_unit text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_permission('manage_sales') OR has_permission('manage_products')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE products
  SET unit = nullif(trim(p_unit), '')
  WHERE id = find_product_id(p_item);
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_unit(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_product_unit(text, text) TO authenticated;
