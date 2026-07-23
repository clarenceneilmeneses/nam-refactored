-- ============================================================
-- NAM Supply — company-wide defaults for the formal quotation
-- Run AFTER 19_item_codes.sql, in the Supabase SQL Editor.
-- Safe to re-run.
--
-- The quote document's VAT mode, delivery lead time, validity and
-- replacement window were hardcoded: every edit lasted only until the
-- preview closed, then reset (VAT back to Inclusive, "4-6" days,
-- "1 month", "7" days). They are now one shared app_settings row, so
-- an edit on the document becomes the default for every future
-- quotation on every device — the same treatment as the item-codes
-- switch (19_item_codes.sql).
--
-- SHARED, NOT PER CLIENT: setting VAT Exempt (0%) here makes every
-- new quotation start at 0% until someone sets it back. Per-client
-- values would live on the clients table instead.
-- ============================================================

BEGIN;

-- app_settings itself comes from 19_item_codes.sql (read policy for all
-- authenticated users; writes only through SECURITY DEFINER RPCs).
INSERT INTO app_settings (key, value)
VALUES (
  'quote_doc_terms',
  jsonb_build_object(
    'vat_mode', 'inclusive',
    'lead_time', '4-6',
    'validity', '1 month',
    'replacement_days', '7'
  )
)
ON CONFLICT (key) DO NOTHING;

-- Encoders hold manage_sales, which is what printing a quotation needs;
-- the document saves these as it prints/closes, exactly like the client
-- contact details and the UOM column.
CREATE OR REPLACE FUNCTION public.set_quote_doc_terms(
  p_vat_mode         text,
  p_lead_time        text,
  p_validity         text,
  p_replacement_days text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_terms   jsonb;
  v_old     jsonb;
  v_user_id integer;
BEGIN
  IF NOT has_permission('manage_sales') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_vat_mode IS NULL OR p_vat_mode NOT IN ('inclusive', 'exclusive', 'exempt') THEN
    RAISE EXCEPTION 'Invalid VAT mode: %', coalesce(p_vat_mode, '(null)');
  END IF;

  -- Blank field on the document → keep the legacy wording rather than
  -- printing an empty term on every future quote.
  v_terms := jsonb_build_object(
    'vat_mode',         p_vat_mode,
    'lead_time',        left(coalesce(nullif(trim(p_lead_time), ''), '4-6'), 40),
    'validity',         left(coalesce(nullif(trim(p_validity), ''), '1 month'), 40),
    'replacement_days', left(coalesce(nullif(trim(p_replacement_days), ''), '7'), 40)
  );

  SELECT value INTO v_old FROM app_settings WHERE key = 'quote_doc_terms';
  IF v_old IS NOT DISTINCT FROM v_terms THEN
    RETURN v_terms;  -- printed without touching the terms
  END IF;

  INSERT INTO app_settings (key, value) VALUES ('quote_doc_terms', v_terms)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

  SELECT id INTO v_user_id FROM users WHERE auth_id = auth.uid();
  INSERT INTO system_logs (user_id, action, description)
  VALUES (
    v_user_id,
    'Updated Quotation Terms',
    'Quotation document defaults → VAT ' || (v_terms ->> 'vat_mode')
      || ', lead time ' || (v_terms ->> 'lead_time') || ' days'
      || ', validity ' || (v_terms ->> 'validity')
      || ', replacement ' || (v_terms ->> 'replacement_days') || ' days'
  );

  RETURN v_terms;
END;
$$;

REVOKE ALL ON FUNCTION public.set_quote_doc_terms(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_quote_doc_terms(text, text, text, text) TO authenticated;

COMMIT;
