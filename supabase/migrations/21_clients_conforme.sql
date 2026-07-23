-- ============================================================
-- NAM Supply — clients.conforme_name
-- Run AFTER 20_quote_doc_terms.sql, in the Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS).
--
-- The Conforme block on the formal quotation always printed the
-- client's company name, and anything typed over it was lost the
-- moment the preview closed — the one remaining field on the document
-- that didn't remember itself. It now behaves like the CONTACT PERSON
-- / CONTACT NUMBER / EMAIL fields (15_clients_contact_details.sql):
-- saved back to the client profile on print or close, and prefilled on
-- the next quote for that company.
--
-- PER CLIENT, not shared: the accepting party differs per company
-- (some sign as the corporation, some name an authorized signatory).
-- NULL means "no override" and the document falls back to the client's
-- company name, which is what every existing client gets.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS conforme_name text;

COMMENT ON COLUMN public.clients.conforme_name IS
  'Name printed under Conforme: on the formal quotation. NULL = use company_name.';
