ALTER TABLE public.protected_first_access_attempts
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'first_access';

DO $patch$
DECLARE
  v_definition text;
  v_needle text := $needle$AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'true'$needle$;
  v_replacement text := $replacement$AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' IN ('true', 'false')$replacement$;
  v_position integer;
BEGIN
  SELECT pg_get_functiondef('public.prevent_protected_admin_auth_change()'::regprocedure)
    INTO v_definition;
  v_position := strpos(v_definition, v_needle);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Protected account trigger phase-one guard was not found; refusing to patch';
  END IF;
  v_definition := overlay(v_definition placing v_replacement from v_position for length(v_needle));
  EXECUTE v_definition;
END;
$patch$;

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
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.encrypted_password, COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_password_hash, v_app_metadata
  FROM auth.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT public.is_protected_admin_email(v_email)
     OR COALESCE(v_app_metadata ->> 'quickbite_protected_account', 'false') <> 'true'
     OR COALESCE(v_app_metadata ->> 'quickbite_must_change_password', 'false') <> 'false'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_user_id
         AND p.role = 'all'
         AND lower(trim(p.email)) = lower(trim(v_email))
     )
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

REVOKE ALL ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_protected_admin_credential_password_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_protected_admin_credential_password_change(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finish_protected_admin_credential_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_protected_admin_credential_password_change(uuid) TO service_role;
