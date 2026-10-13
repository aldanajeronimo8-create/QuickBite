-- Protected credential rotation is initiated by an authenticated administrator.
-- Do not use auth.role() = 'service_role' as the authorization check here: the
-- Edge Function's modern sb_secret API key is not a JWT identity. The actor JWT
-- must be verified by these SECURITY DEFINER functions and the target is fixed
-- to a protected role=all identity.
CREATE OR REPLACE FUNCTION public.begin_protected_admin_credential_password_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_email text;
  v_password_hash text;
  v_app_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_protected_credentials' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.encrypted_password, COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_password_hash, v_app_metadata
  FROM auth.users u
  JOIN public.profiles p
    ON p.id = u.id
   AND p.role = 'all'
   AND lower(trim(p.email)) = lower(trim(u.email))
  WHERE u.id = p_user_id
  FOR UPDATE OF u;

  IF NOT FOUND
     OR NOT public.is_protected_admin_email(v_email)
     OR COALESCE(v_app_metadata ->> 'quickbite_protected_account', 'false') <> 'true'
     OR COALESCE(v_app_metadata ->> 'quickbite_must_change_password', 'false') <> 'false'
     OR COALESCE(v_password_hash, '') = '' THEN
    RAISE EXCEPTION 'protected_admin_credential_state_invalid' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.protected_first_access_attempts
    (user_id, previous_password_hash, password_changed_at, created_at, expires_at, purpose)
  VALUES
    (p_user_id, v_password_hash, NULL, clock_timestamp(), clock_timestamp() + interval '10 minutes', 'admin_rotation')
  ON CONFLICT (user_id) DO UPDATE
    SET previous_password_hash = EXCLUDED.previous_password_hash,
        password_changed_at = NULL,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        purpose = EXCLUDED.purpose;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_protected_admin_credential_password_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_protected_credentials' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.protected_admins pa
      ON lower(trim(pa.email)) = lower(trim(u.email))
    JOIN public.profiles p
      ON p.id = u.id
     AND p.role = 'all'
     AND lower(trim(p.email)) = lower(trim(u.email))
    JOIN public.protected_first_access_attempts a
      ON a.user_id = u.id
    WHERE u.id = p_user_id
      AND COALESCE(u.raw_app_meta_data ->> 'quickbite_protected_account', 'false') = 'true'
      AND COALESCE(u.raw_app_meta_data ->> 'quickbite_must_change_password', 'false') = 'false'
      AND a.purpose = 'admin_rotation'
      AND a.password_changed_at IS NOT NULL
      AND a.previous_password_hash IS DISTINCT FROM u.encrypted_password
      AND a.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'protected_admin_password_change_not_verified' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.protected_first_access_attempts
  WHERE user_id = p_user_id AND purpose = 'admin_rotation';
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_protected_admin_credential_password_change(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_protected_admin_credential_password_change(uuid) TO authenticated;
