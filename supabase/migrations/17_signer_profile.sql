-- ============================================================
-- NAM Supply — per-account quote signatory
-- Run AFTER 08_profile.sql, in the Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS).
--
-- The name/position under the formal quote's e-signature follow the
-- logged-in account: they prefill from these columns and edits on the
-- document save back on print/close (writes allowed by 08_profile.sql's
-- "users self update" policy). NULL means "never set" — the app falls
-- back to the device-cached value from the previous build, then to the
-- legacy defaults (ALLYSON ASHLEY AGUILERA / Sales and Technical
-- Officer).
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS quote_signer_name  text,
  ADD COLUMN IF NOT EXISTS quote_signer_title text;
