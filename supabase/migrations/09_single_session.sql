-- 09_single_session.sql — one active device per account
-- Run once in the Supabase SQL editor (after 08_profile.sql).
--
-- The app writes a random device id into users.current_session_id on every
-- login. Other devices holding the same account see the id change (checked on
-- focus + every 30s) and sign themselves out — so a new login always wins and
-- only one device stays active. Uses the existing "users self update" RLS
-- policy from 08_profile.sql; no new policies needed.

alter table public.users add column if not exists current_session_id text;
