-- ============================================================
-- NAM Supply — clients.contact_number + clients.email
-- Run AFTER 06_clients_default_term.sql, in the Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS).
--
-- The formal quotation's CONTACT PERSON / CONTACT NUMBER / EMAIL
-- ADDRESS fields used to be blank every time (same as the legacy
-- system — a long-standing complaint). They now load from the client
-- profile and any edits made on the document are saved back when the
-- quote is printed or closed, so each company's details fill
-- themselves on the next quote. Also editable in the Sales Entry
-- client manager.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS email text;
