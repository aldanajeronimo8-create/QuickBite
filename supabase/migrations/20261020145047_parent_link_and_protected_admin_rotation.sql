-- Family-link compatibility and protected-admin credential rotation.
-- Keep family linking code-based for parent self-service, but allow every role
-- that the application treats as a parent (including the dual student/admin role).
CREATE OR REPLACE FUNCTION public.link_parent_to_student(
  p_student_code text,
  p_relationship text DEFAULT 'Acudiente'::text
)
RETURNS public.parent_student_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_code_id uuid;
  v_link public.parent_student_links;
  v_parent_count integer;
  v_student_parent_count integer;
  v_relationship text := nullif(trim(p_relationship), '');
BEGIN
  IF v_parent IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_parent
      AND role IN ('parent', 'both', 'student_parent', 'all')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;

  IF v_relationship IS NULL THEN
    v_relationship := 'Acudiente';
  END IF;
  IF v_relationship NOT IN ('Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Familiar','Otro') THEN
    RAISE EXCEPTION 'invalid_relationship';
  END IF;

  SELECT id, student_user_id INTO v_code_id, v_student
  FROM public.family_link_codes
  WHERE code = upper(trim(p_student_code))
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF v_code_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_student_code';
  END IF;
  IF v_student = v_parent THEN
    RAISE EXCEPTION 'invalid_family_link';
  END IF;

  SELECT count(*) INTO v_student_parent_count
  FROM public.parent_student_links
  WHERE student_user_id = v_student
    AND active = true
    AND parent_user_id <> v_parent;
  IF v_student_parent_count >= 2 THEN
    RAISE EXCEPTION 'student_parent_limit_reached';
  END IF;

  SELECT count(*) INTO v_parent_count
  FROM public.parent_student_links
  WHERE parent_user_id = v_parent
    AND active = true
    AND student_user_id <> v_student;
  IF v_parent_count >= 4 THEN
    RAISE EXCEPTION 'parent_child_limit_reached';
  END IF;

  INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
  VALUES (v_parent, v_student, v_relationship, true)
  ON CONFLICT (parent_user_id, student_user_id)
  DO UPDATE SET relationship = excluded.relationship, active = true
  RETURNING * INTO v_link;

  UPDATE public.family_link_codes
  SET used_at = now(), used_by_parent_user_id = v_parent
  WHERE id = v_code_id;

  RETURN v_link;
END;
$function$;

-- Only a different, active, fully activated protected administrator may rotate
-- another protected account's password. A regular admin is intentionally insufficient.
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
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.users actor
    JOIN public.profiles actor_profile
      ON actor_profile.id = actor.id
     AND lower(trim(actor_profile.email)) = lower(trim(actor.email))
    WHERE actor.id = auth.uid()
      AND actor_profile.role = 'all'
      AND actor_profile.active = true
      AND public.is_protected_admin_email(actor.email)
      AND COALESCE(actor.raw_app_meta_data ->> 'quickbite_protected_account', 'false') = 'true'
      AND COALESCE(actor.raw_app_meta_data ->> 'quickbite_must_change_password', 'false') = 'false'
  ) THEN
    RAISE EXCEPTION 'protected_admin_actor_required' USING ERRCODE = '42501';
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
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.users actor
    JOIN public.profiles actor_profile
      ON actor_profile.id = actor.id
     AND lower(trim(actor_profile.email)) = lower(trim(actor.email))
    WHERE actor.id = auth.uid()
      AND actor_profile.role = 'all'
      AND actor_profile.active = true
      AND public.is_protected_admin_email(actor.email)
      AND COALESCE(actor.raw_app_meta_data ->> 'quickbite_protected_account', 'false') = 'true'
      AND COALESCE(actor.raw_app_meta_data ->> 'quickbite_must_change_password', 'false') = 'false'
  ) THEN
    RAISE EXCEPTION 'protected_admin_actor_required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_protected_credentials' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p
      ON p.id = u.id
     AND p.role = 'all'
     AND lower(trim(p.email)) = lower(trim(u.email))
    JOIN public.protected_first_access_attempts a
      ON a.user_id = u.id
    WHERE u.id = p_user_id
      AND public.is_protected_admin_email(u.email)
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
