CREATE OR REPLACE FUNCTION public.begin_protected_first_access_password_change(p_user_id uuid)
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
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.encrypted_password, COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_password_hash, v_app_metadata
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND
     OR NOT public.is_protected_admin_email(v_email)
     OR COALESCE(v_app_metadata ->> 'quickbite_protected_account', 'false') <> 'true'
     OR COALESCE(v_app_metadata ->> 'quickbite_must_change_password', 'false') <> 'true'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_user_id
         AND p.role = 'all'
         AND lower(trim(p.email)) = lower(trim(v_email))
     )
     OR COALESCE(v_password_hash, '') = '' THEN
    RAISE EXCEPTION 'protected_first_access_state_invalid' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.protected_first_access_attempts
    (user_id, previous_password_hash, password_changed_at, created_at, expires_at, purpose)
  VALUES
    (p_user_id, v_password_hash, NULL, clock_timestamp(), clock_timestamp() + interval '10 minutes', 'first_access')
  ON CONFLICT (user_id) DO UPDATE
    SET previous_password_hash = EXCLUDED.previous_password_hash,
        password_changed_at = NULL,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        purpose = EXCLUDED.purpose;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_protected_first_access_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_protected_first_access_password_change(uuid) TO service_role;