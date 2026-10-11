CREATE OR REPLACE FUNCTION public.complete_protected_first_access_password_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_email text;
  v_app_metadata jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_app_metadata
  FROM auth.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

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
     OR NOT EXISTS (
       SELECT 1
       FROM public.protected_first_access_attempts a
       JOIN auth.users u ON u.id = a.user_id
       WHERE a.user_id = p_user_id
         AND a.password_changed_at IS NOT NULL
         AND a.previous_password_hash IS DISTINCT FROM u.encrypted_password
         AND a.expires_at > clock_timestamp()
     ) THEN
    RAISE EXCEPTION 'protected_first_access_state_invalid' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_protected_admin_maintenance', 'true', true);

  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
       jsonb_build_object(
         'quickbite_protected_account', true,
         'quickbite_must_change_password', false,
         'quickbite_first_password_changed_at', clock_timestamp()::text
       ),
         updated_at = clock_timestamp()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'protected_user_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.protected_first_access_attempts WHERE user_id = p_user_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_protected_first_access_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_protected_first_access_password_change(uuid) TO service_role;
