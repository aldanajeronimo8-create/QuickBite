-- QuickBite: fix password reset RPC pgcrypto schema resolution.
-- Supabase commonly installs pgcrypto in the `extensions` schema, so SECURITY
-- DEFINER functions must reference crypt/gen_salt with a stable search_path.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_email        TEXT,
  p_reset_code   TEXT,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id     UUID;
  v_stored_code TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE email = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'email_not_found';
  END IF;

  SELECT value INTO v_stored_code
  FROM public.app_secrets
  WHERE key = 'password_reset_code';

  IF v_stored_code IS NULL OR trim(p_reset_code) <> v_stored_code THEN
    RAISE EXCEPTION 'invalid_reset_code';
  END IF;

  IF length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = NOW()
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;
