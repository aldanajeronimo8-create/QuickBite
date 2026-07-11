-- QuickBite: server-side password-reset RPC.
-- Apply in Supabase dashboard: SQL Editor → paste → Run.
-- Depends on app_secrets table created in 20260610000001_secure_admin_invite.sql.
--
-- After applying, set the reset code (replace with your own):
--   INSERT INTO public.app_secrets (key, value)
--   VALUES ('password_reset_code', '29062025')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Seed default reset code (matches the current client-side constant).
INSERT INTO public.app_secrets (key, value)
VALUES ('password_reset_code', '29062025')
ON CONFLICT (key) DO NOTHING;

-- reset_user_password: validate email exists in profiles, validate code
-- server-side, then directly update auth.users password.
-- Callable by anon/authenticated; code provides the authorization gate.
CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_email       TEXT,
  p_reset_code  TEXT,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_stored_code TEXT;
BEGIN
  -- 1. Verify email exists in the profiles table.
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE email = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'email_not_found';
  END IF;

  -- 2. Validate reset code against server-stored value.
  SELECT value INTO v_stored_code
  FROM public.app_secrets
  WHERE key = 'password_reset_code';

  IF v_stored_code IS NULL OR trim(p_reset_code) <> v_stored_code THEN
    RAISE EXCEPTION 'invalid_reset_code';
  END IF;

  -- 3. Enforce minimum password length.
  IF length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  -- 4. Update the password directly in auth.users.
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at         = NOW()
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;
