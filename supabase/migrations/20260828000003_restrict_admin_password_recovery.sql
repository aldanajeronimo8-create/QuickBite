-- Student accounts may use the recovery flow. Administrator and combined
-- accounts must have their password changed by another administrator from the
-- Users panel, which calls admin_update_user.

CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE email = lower(trim(p_email))
      AND role = 'student'
  );
$$;

CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_email TEXT,
  p_reset_code TEXT,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_stored_code TEXT;
BEGIN
  SELECT id, role INTO v_user_id, v_role
  FROM public.profiles
  WHERE email = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'email_not_found';
  END IF;

  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'administrator_password_requires_admin_panel';
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
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = '',
      recovery_token = '',
      updated_at = NOW()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.email_exists(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;
