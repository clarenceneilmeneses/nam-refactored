-- 08_profile.sql — self-service profile (display name, password, avatar photo)
-- Run once in the Supabase SQL editor. Password changes need nothing here
-- (handled by Supabase Auth); this covers the avatar bucket + self-update RLS.

-- 0) Avatar URL column on the users row (source of truth, shown on the admin
--    Users list and in the sidebar).
alter table public.users add column if not exists avatar_url text;

-- 1) Public avatar storage bucket -------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2) Storage RLS: anyone may read; a user may write only their own folder,
--    which the app names "<auth uid>/avatar.<ext>".
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

-- 3) Let a signed-in user update their OWN users row (display name).
--    Assumes public.users.auth_id links to auth.uid() (see 03_auth_rls.sql).
--    If RLS is not yet enabled on public.users this is harmless.
drop policy if exists "users self update" on public.users;
create policy "users self update"
  on public.users for update to authenticated
  using ( auth_id = auth.uid() )
  with check ( auth_id = auth.uid() );
