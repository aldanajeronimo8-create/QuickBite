-- QuickBite: admin-managed user CRUD backed by Supabase Auth + public.profiles.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
CREATE POLICY profiles_admin_delete
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'student',
  p_ti TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role NOT IN ('admin', 'student') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN
    RAISE EXCEPTION 'ti_required';
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE ti = trim(p_ti)
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
    NOW(),
    NOW()
  );

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (v_user_id, v_email, trim(p_full_name), v_role, NULLIF(trim(COALESCE(p_ti, '')), ''));

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_ti TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role NOT IN ('admin', 'student') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN
    RAISE EXCEPTION 'ti_required';
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE ti = trim(p_ti)
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE email = v_email
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  UPDATE auth.users
  SET email = v_email,
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET identity_data = identity_data
        || jsonb_build_object('email', v_email),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND provider = 'email';

  UPDATE public.profiles
  SET email = v_email,
      full_name = trim(p_full_name),
      role = v_role,
      ti = NULLIF(trim(COALESCE(p_ti, '')), ''),
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
