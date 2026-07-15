-- ============================================================
-- NAM Supply — clients.default_payment_term
-- Run AFTER 01_schema.sql … 05_records_rpc.sql in the Supabase
-- SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- The Sales Entry client manager (legacy save_client.php) stores a
-- default payment term per client, auto-filled into the Document
-- Header when the client is picked.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_payment_term text;
