-- The five protected accounts cannot be deleted or have their roles changed.
-- A different administrator (admin or both) may rotate only their email and
-- password through this narrowly-scoped RPC.

CREATE OR REPLACE FUNCTION public.admin_update_protected_credentials(
  p_user_id UUID,
  p_email TEXT,
  p_password TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_current_email TEXT;
  v_new_email TEXT := lower(trim(p_email));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_protected_credentials';
  END IF;

  IF v_new_email = '' OR position('@' IN v_new_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF p_password IS NOT NULL AND trim(p_password) <> '' AND length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  SELECT lower(email) INTO v_current_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_current_email IS NULL OR NOT public.is_protected_admin_email(v_current_email) THEN
    RAISE EXCEPTION 'protected_account_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = v_new_email AND id <> p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(email) = v_new_email AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  -- This is local to the RPC transaction and permits only the credential
  -- rotation below. The triggers remain active for every other operation.
  PERFORM set_config('app.allow_protected_admin_maintenance', 'true', true);

  UPDATE auth.users
  SET email = v_new_email,
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND trim(p_password) <> ''
          THEN extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
        ELSE encrypted_password
      END,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = '',
      recovery_token = '',
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  UPDATE auth.identities
  SET identity_data = identity_data
        || jsonb_build_object('email', v_new_email, 'email_verified', true),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND provider = 'email';

  UPDATE public.profiles
  SET email = v_new_email,
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.protected_admins
  SET email = v_new_email
  WHERE email = v_current_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'protected_account_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_protected_credentials(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_protected_credentials(UUID, TEXT, TEXT) TO authenticated;
