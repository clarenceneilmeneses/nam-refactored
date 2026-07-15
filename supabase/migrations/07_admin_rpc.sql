-- ============================================================
-- NAM Supply — Admin (Users page) RPCs
-- Run AFTER 01_schema.sql … 06_clients_default_term.sql in the
-- Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE).
--
-- The browser app only holds the publishable (anon) key, so it
-- cannot call the Supabase Auth admin API. These SECURITY DEFINER
-- functions (owned by postgres, which may write to the auth schema)
-- let a signed-in admin with manage_users:
--   * admin_create_user  — create the Auth login (email =
--     username@nam.local unless a real email is given, auto-
--     confirmed) AND the linked public.users row, like users.php
--   * admin_update_user  — edit username/full name/role; an empty
--     password keeps the old one (legacy behaviour), a non-empty
--     one resets it. If the row was never linked to an Auth user,
--     setting a password creates + links the login.
--   * admin_delete_user  — delete both rows; blocks deleting
--     yourself and the last Super Admin (role id 1).
-- ============================================================

-- The legacy `password` column (if it still exists) blocks inserts
-- with its NOT NULL constraint; Supabase Auth owns passwords now.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password') THEN
    ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
  END IF;
END $$;

-- Internal: insert a confirmed email+password user into the auth
-- schema. Not granted to any app role — only callable through the
-- SECURITY DEFINER functions below.
CREATE OR REPLACE FUNCTION public.admin_create_auth_user(p_email text, p_password text, p_full_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'A login with email % already exists', p_email;
  END IF;

  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, reauthentication_token,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
     lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
     '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name', p_full_name),
     now(), now());

  INSERT INTO auth.identities
    (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (v_uid::text, v_uid,
     jsonb_build_object('sub', v_uid::text, 'email', lower(p_email),
                        'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now());

  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user
  (p_username text, p_password text, p_full_name text, p_role_id integer, p_email text DEFAULT NULL)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := coalesce(nullif(trim(p_email), ''), lower(trim(p_username)) || '@nam.local');
  v_uid   uuid;
  v_row   users;
BEGIN
  IF NOT has_permission('manage_users') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF coalesce(trim(p_username), '') = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(trim(p_username))) THEN
    RAISE EXCEPTION 'Username % is already taken', trim(p_username);
  END IF;

  v_uid := admin_create_auth_user(v_email, p_password, p_full_name);

  INSERT INTO users (username, full_name, role_id, auth_id)
  VALUES (trim(p_username), nullif(trim(p_full_name), ''), p_role_id, v_uid)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user
  (p_id integer, p_username text, p_full_name text, p_role_id integer, p_password text DEFAULT NULL)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old       users;
  v_new_name  text := trim(p_username);
  v_old_email text;
  v_new_email text;
  v_row       users;
BEGIN
  IF NOT has_permission('manage_users') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF coalesce(v_new_name, '') = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  SELECT * INTO v_old FROM users WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_id;
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(v_new_name) AND id <> p_id) THEN
    RAISE EXCEPTION 'Username % is already taken', v_new_name;
  END IF;
  -- Never leave the system without a Super Admin.
  IF v_old.role_id = 1 AND coalesce(p_role_id, 0) <> 1
     AND NOT EXISTS (SELECT 1 FROM users WHERE role_id = 1 AND id <> p_id) THEN
    RAISE EXCEPTION 'Cannot remove the Super Admin role from the last Super Admin';
  END IF;

  -- Keep the synthetic @nam.local login email in step with the username.
  IF v_old.auth_id IS NOT NULL AND lower(v_new_name) <> lower(v_old.username) THEN
    SELECT email INTO v_old_email FROM auth.users WHERE id = v_old.auth_id;
    IF v_old_email = lower(v_old.username) || '@nam.local' THEN
      v_new_email := lower(v_new_name) || '@nam.local';
      IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_new_email AND id <> v_old.auth_id) THEN
        RAISE EXCEPTION 'A login with email % already exists', v_new_email;
      END IF;
      UPDATE auth.users SET email = v_new_email, updated_at = now() WHERE id = v_old.auth_id;
      UPDATE auth.identities
      SET identity_data = identity_data || jsonb_build_object('email', v_new_email),
          updated_at = now()
      WHERE user_id = v_old.auth_id AND provider = 'email';
    END IF;
  END IF;

  -- Blank password keeps the old one (legacy users.php behaviour).
  IF coalesce(p_password, '') <> '' THEN
    IF length(p_password) < 6 THEN
      RAISE EXCEPTION 'Password must be at least 6 characters';
    END IF;
    IF v_old.auth_id IS NULL THEN
      -- Legacy row never linked to Supabase Auth: create + link the login now.
      UPDATE users SET auth_id = admin_create_auth_user(lower(v_new_name) || '@nam.local', p_password, p_full_name)
      WHERE id = p_id;
    ELSE
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
          updated_at = now()
      WHERE id = v_old.auth_id;
    END IF;
  END IF;

  UPDATE users
  SET username = v_new_name,
      full_name = nullif(trim(p_full_name), ''),
      role_id = p_role_id
  WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_id integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target users;
BEGIN
  IF NOT has_permission('manage_users') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_target FROM users WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_id;
  END IF;
  IF v_target.auth_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;
  IF v_target.role_id = 1
     AND NOT EXISTS (SELECT 1 FROM users WHERE role_id = 1 AND id <> p_id) THEN
    RAISE EXCEPTION 'Cannot delete the last Super Admin';
  END IF;

  -- system_logs keeps its rows (no FK) — the Logs page shows "User #id".
  DELETE FROM users WHERE id = p_id;
  IF v_target.auth_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_target.auth_id;  -- identities/sessions cascade
  END IF;
END;
$$;

-- Lock down: the internal helper is not callable by app roles at all;
-- the admin functions require sign-in (and re-check manage_users inside).
REVOKE ALL ON FUNCTION public.admin_create_auth_user(text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, integer, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_update_user(integer, text, text, integer, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(integer, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(integer) TO authenticated;
