-- Backfill the `clients` master table from companies that only exist in `sales`.
--
-- Why: production data was imported straight into `sales` with the company name
-- stored inline on each row, but no matching profiles were ever created in the
-- `clients` table. So the Company autocomplete (which merges clients + distinct
-- sales.company) finds past customers, while "Select from List" (clients only)
-- shows nothing. This creates one client profile per distinct company in sales,
-- taking address/TIN/contact/terms from that company's MOST RECENT sane-dated sale.
--
-- Safe to run in the Supabase SQL editor. It only INSERTs; it never touches
-- existing sales, quotations, or clients. Idempotent — the NOT EXISTS guard
-- means re-running after a future dump import only adds newly-seen companies.
-- Company names are matched exactly after trimming (same as the dashboard's
-- companyKey), so "ABC Corp" and "ABC CORP" stay distinct, as they do everywhere else.

-- 1) PREVIEW — how many new profiles would be created (run first, inserts nothing):
SELECT count(*) AS clients_to_add
FROM (
  SELECT DISTINCT btrim(s.company) AS company_name
  FROM sales s
  WHERE s.company IS NOT NULL
    AND btrim(s.company) <> ''
    AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.company_name = btrim(s.company))
) t;

-- 2) BACKFILL — create the missing client profiles:
INSERT INTO clients (company_name, address, tin, contact_person, default_payment_term)
SELECT DISTINCT ON (btrim(s.company))
  btrim(s.company)                             AS company_name,
  NULLIF(btrim(s.address), '')                 AS address,
  NULLIF(btrim(s.tin), '')                     AS tin,
  NULLIF(btrim(s.contact_person_contact), '')  AS contact_person,       -- app maps this to clients.contact_person
  NULLIF(btrim(s.payment_term), '')            AS default_payment_term
FROM sales s
WHERE s.company IS NOT NULL
  AND btrim(s.company) <> ''
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.company_name = btrim(s.company))
ORDER BY
  btrim(s.company),
  (s.date < DATE '2100-01-01') DESC,  -- prefer real dates over legacy typo years (e.g. 0206)
  s.date DESC;                        -- then the company's most recent sale wins its details

-- 3) VERIFY — total client profiles now, and a sample of what was added:
SELECT count(*) AS total_clients FROM clients;
SELECT company_name, address, tin, contact_person, default_payment_term
FROM clients
ORDER BY created_at DESC, company_name
LIMIT 20;
