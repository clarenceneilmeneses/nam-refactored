-- ============================================================
-- NAM Supply — SI # review workflow (storage only)
-- Run AFTER 10_sane_dates.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- This adds ONLY the columns needed to remember that Ms. Jessel Rose
-- Genotiva has reviewed a record's SI #. The rules themselves (only
-- Allyson enters the SI #, only Jessel reviews, Paid is blocked until
-- reviewed) are enforced in the app UI — there are no triggers/RLS here.
-- ============================================================

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS si_reviewed    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS si_reviewed_by integer     REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS si_reviewed_at timestamptz;
