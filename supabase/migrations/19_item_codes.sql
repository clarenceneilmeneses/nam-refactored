-- ============================================================
-- NAM Supply — opt-in item codes for the product catalog
-- Run AFTER 18_legacy_restore.sql, in the Supabase SQL Editor.
-- Safe to re-run.
--
-- Item codes are OFF by default: nothing changes until someone with
-- manage_products presses "Activate item codes" on the Products tab
-- (a one-time transition). Activation:
--
--   1. gives every category a short prefix derived from its name
--      (OFFICE SUPPLIES → OS, MEDICINE → MED, …; collisions get a
--      number suffix; uncategorized products use GEN),
--   2. backfills a code for the ENTIRE catalog: PREFIX-0001,
--      PREFIX-0002, … numbered per category in name order,
--   3. flips the app_settings flag so the trigger below codes every
--      new product automatically from then on.
--
-- Codes are permanent identifiers: once assigned they never change,
-- even if the product is renamed or recategorized. activate_item_codes
-- is idempotent — re-running it only codes products that have no code
-- yet, which is also how the catalog is re-coded after a Legacy
-- Restore truncates products (the trigger handles restored rows as
-- they insert, so in practice the backfill finds nothing to do).
-- ============================================================

BEGIN;

-- 1. Columns ------------------------------------------------------------------
ALTER TABLE products   ADD COLUMN IF NOT EXISTS item_code   text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS code_prefix text;

COMMENT ON COLUMN products.item_code IS
  'Permanent inventory code (e.g. OS-0001). NULL until item codes are activated; assigned once, never regenerated.';
COMMENT ON COLUMN categories.code_prefix IS
  'Short prefix used for this category''s item codes, derived from the name at activation.';

-- Unique across the catalog; multiple NULLs allowed pre-activation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_item_code   ON products (item_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_code_prefix ON categories (code_prefix);

-- 2. Shared on/off switch -----------------------------------------------------
-- Device-local preferences live in localStorage (useSettings); this flag has
-- to be shared by everyone, so it lives in the database. Generic key/value so
-- future app-wide switches don't need another table.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_settings IS
  'App-wide (not per-device) switches. Read by everyone signed in; written only through SECURITY DEFINER RPCs.';

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings read" ON app_settings;
CREATE POLICY "app_settings read" ON app_settings FOR SELECT TO authenticated USING (true);
-- No insert/update/delete policies: writes go through activate_item_codes().

CREATE OR REPLACE FUNCTION public.item_codes_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT value = 'true'::jsonb FROM app_settings WHERE key = 'item_codes_enabled'),
    false
  );
$$;

-- 3. Prefix derivation ----------------------------------------------------------
-- Multi-word names → initials (skipping filler words), single words → first
-- three letters: OFFICE SUPPLIES → OS, OFFICE TOOLS AND EQUIPMENT → OTE,
-- CONSUMABLES → CON, PPE → PPE. GEN is reserved for uncategorized products.
CREATE OR REPLACE FUNCTION public.derive_item_prefix(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH words AS (
    SELECT w, ord
    FROM regexp_split_to_table(upper(coalesce(p_name, '')), '[^A-Z]+') WITH ORDINALITY AS t(w, ord)
    WHERE w <> '' AND w NOT IN ('AND', 'OF', 'THE', 'FOR')
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM words) = 0 THEN 'GEN'
    WHEN (SELECT count(*) FROM words) = 1 THEN (SELECT substr(w, 1, 3) FROM words)
    ELSE (SELECT string_agg(substr(w, 1, 1), '' ORDER BY ord)
          FROM (SELECT w, ord FROM words ORDER BY ord LIMIT 4) x)
  END;
$$;

-- 4 digits zero-padded, but never truncated (lpad would clip a 5-digit
-- sequence back into the 4-digit range and collide).
CREATE OR REPLACE FUNCTION public.format_item_number(p_n integer)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad(p_n::text, greatest(4, length(p_n::text)), '0');
$$;

-- Returns the prefix for a product's category, deriving + persisting it on
-- the categories row the first time. Category values that predate the
-- categories table (stray legacy text) still get a derived prefix — it just
-- isn't stored anywhere, which is fine: numbering below keys off the codes
-- themselves, not this table.
CREATE OR REPLACE FUNCTION public.ensure_category_prefix(p_category text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_base   text;
  v_n      integer := 2;
BEGIN
  IF p_category IS NULL OR trim(p_category) = '' OR upper(trim(p_category)) = 'UNCATEGORIZED' THEN
    RETURN 'GEN';
  END IF;

  SELECT code_prefix INTO v_prefix
  FROM categories
  WHERE upper(name) = upper(trim(p_category)) AND code_prefix IS NOT NULL;
  IF v_prefix IS NOT NULL THEN
    RETURN v_prefix;
  END IF;

  v_base   := derive_item_prefix(p_category);
  v_prefix := v_base;
  WHILE v_prefix = 'GEN' OR EXISTS (SELECT 1 FROM categories WHERE code_prefix = v_prefix) LOOP
    v_prefix := v_base || v_n;
    v_n := v_n + 1;
  END LOOP;

  UPDATE categories SET code_prefix = v_prefix WHERE upper(name) = upper(trim(p_category));
  RETURN v_prefix;
END;
$$;

-- 4. Activation / backfill RPC ---------------------------------------------------
-- First call: flips the flag and codes the whole catalog. Later calls: no-op
-- unless some products are uncoded (returns how many it coded either way).
CREATE OR REPLACE FUNCTION public.activate_item_codes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_already boolean;
  v_count   integer;
  v_user_id integer;
BEGIN
  IF NOT has_permission('manage_products') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_already := item_codes_enabled();
  INSERT INTO app_settings (key, value) VALUES ('item_codes_enabled', 'true'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();

  -- Serialize against the per-prefix insert trigger below.
  PERFORM pg_advisory_xact_lock(hashtext('item_codes_backfill'));

  WITH todo AS (
    SELECT p.id, ensure_category_prefix(p.category_code) AS prefix, p.name
    FROM products p
    WHERE p.item_code IS NULL
  ),
  existing AS (
    SELECT split_part(item_code, '-', 1) AS prefix,
           max(nullif(substring(item_code FROM '[0-9]+$'), '')::integer) AS maxn
    FROM products
    WHERE item_code IS NOT NULL
    GROUP BY 1
  ),
  numbered AS (
    SELECT t.id, t.prefix || '-' || format_item_number(
             coalesce(e.maxn, 0)
             + row_number() OVER (PARTITION BY t.prefix ORDER BY t.name, t.id)::integer) AS code
    FROM todo t
    LEFT JOIN existing e ON e.prefix = t.prefix
  )
  UPDATE products p SET item_code = n.code FROM numbered n WHERE p.id = n.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT id INTO v_user_id FROM users WHERE auth_id = auth.uid();
  IF NOT v_already OR v_count > 0 THEN
    INSERT INTO system_logs (user_id, action, description)
    VALUES (v_user_id,
            CASE WHEN v_already THEN 'Generated Item Codes' ELSE 'Activated Item Codes' END,
            CASE WHEN v_already
                 THEN 'Assigned item codes to ' || v_count || ' uncoded product(s)'
                 ELSE 'Activated item codes — coded ' || v_count || ' product(s) across the catalog'
            END);
  END IF;

  RETURN v_count;
END;
$$;

-- 5. Auto-code new products -------------------------------------------------------
-- BEFORE INSERT so restored legacy rows and quotation-created drafts get
-- coded too. The advisory lock serializes concurrent inserts per prefix so
-- two encoders can't both grab OS-0421.
CREATE OR REPLACE FUNCTION public.products_assign_item_code()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_next   integer;
BEGIN
  IF NEW.item_code IS NOT NULL OR NOT item_codes_enabled() THEN
    RETURN NEW;
  END IF;
  v_prefix := ensure_category_prefix(NEW.category_code);
  PERFORM pg_advisory_xact_lock(hashtext('item_code:' || v_prefix));
  SELECT coalesce(max(nullif(substring(item_code FROM '[0-9]+$'), '')::integer), 0) + 1
  INTO v_next
  FROM products
  WHERE item_code LIKE v_prefix || '-%';
  NEW.item_code := v_prefix || '-' || format_item_number(v_next);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_item_code ON products;
CREATE TRIGGER products_item_code
BEFORE INSERT ON products
FOR EACH ROW EXECUTE FUNCTION products_assign_item_code();

-- 6. Lock down --------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.derive_item_prefix(text)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.format_item_number(integer)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_category_prefix(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.item_codes_enabled()         FROM public, anon;
REVOKE ALL ON FUNCTION public.activate_item_codes()        FROM public, anon;
GRANT EXECUTE ON FUNCTION public.item_codes_enabled()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_item_codes() TO authenticated;

COMMIT;
