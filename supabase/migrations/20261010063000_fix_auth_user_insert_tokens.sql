-- Auth Admin's admin/users response requires empty-string token fields rather than NULL.
-- Custom SQL account creation must populate these fields because auth.users is managed by the platform.

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text DEFAULT 'student'::text,
  p_ti text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_role NOT IN ('admin','student','staff') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) < 2 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 2 OR length(trim(p_full_name)) > 120 THEN RAISE EXCEPTION 'invalid_full_name'; END IF;
  IF p_password IS NULL OR length(trim(p_password)) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN RAISE EXCEPTION 'ti_required'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email)=v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users(
      instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,
      email_change_token_current,phone_change,phone_change_token,reauthentication_token,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at
    )
    VALUES(
      '00000000-0000-0000-0000-000000000000',v_user_id,'authenticated','authenticated',v_email,
      extensions.crypt(p_password,extensions.gen_salt('bf')),now(),
      '','','','','','','','',
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name',trim(p_full_name),'role',v_role),now(),now()
    );
    INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    VALUES(
      v_user_id::text,v_user_id,
      jsonb_build_object('sub',v_user_id::text,'email',v_email,'email_verified',true,'phone_verified',false),
      'email',now(),now(),now()
    ) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE auth.users SET encrypted_password=extensions.crypt(p_password,extensions.gen_salt('bf')),
      email_confirmed_at=coalesce(email_confirmed_at,now()),
      raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('full_name',trim(p_full_name),'role',v_role),
      updated_at=now()
    WHERE id=v_user_id;
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti)<>'' AND EXISTS(
    SELECT 1 FROM public.profiles WHERE ti=trim(p_ti) AND id<>v_user_id
  ) THEN RAISE EXCEPTION 'ti_already_registered'; END IF;

  INSERT INTO public.profiles(id,email,full_name,role,ti)
  VALUES(v_user_id,v_email,trim(p_full_name),v_role,nullif(trim(coalesce(p_ti,'')),''))
  ON CONFLICT(id) DO UPDATE SET
    email=excluded.email,full_name=excluded.full_name,role=excluded.role,ti=excluded.ti,updated_at=now();
  RETURN v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_manage_user(
  p_user_id uuid DEFAULT NULL::uuid,
  p_email text DEFAULT NULL::text,
  p_password text DEFAULT NULL::text,
  p_full_name text DEFAULT NULL::text,
  p_role text DEFAULT 'student'::text,
  p_ti text DEFAULT NULL::text,
  p_student_code text DEFAULT NULL::text,
  p_relationship text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_user_id UUID := p_user_id;
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_full_name TEXT := trim(COALESCE(p_full_name, ''));
  v_role TEXT := lower(trim(COALESCE(p_role, '')));
  v_password TEXT := COALESCE(p_password, '');
  v_ti TEXT := NULLIF(trim(COALESCE(p_ti, '')), '');
  v_code TEXT := upper(trim(COALESCE(p_student_code, '')));
  v_relationship TEXT := NULLIF(trim(COALESCE(p_relationship, '')), '');
  v_student UUID;
  v_code_id UUID;
  v_existing_parent_link UUID;
  v_student_parent_count INTEGER;
  v_parent_child_count INTEGER;
  v_existing_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_email = '' OR position('@' in v_email) = 0 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF v_full_name = '' THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF v_role NOT IN ('admin', 'student', 'parent', 'staff', 'both', 'student_parent') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  IF p_user_id IS NULL AND length(v_password) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  IF p_user_id IS NOT NULL AND p_password IS NOT NULL AND v_password <> '' AND length(v_password) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;

  IF v_role IN ('student', 'both', 'student_parent') AND v_ti IS NULL THEN RAISE EXCEPTION 'ti_required'; END IF;
  IF v_role IN ('admin', 'parent', 'staff') THEN v_ti := NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(email) = v_email
      AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = v_email
      AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN RAISE EXCEPTION 'email_already_registered'; END IF;

  IF v_ti IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE ti = v_ti
      AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN RAISE EXCEPTION 'ti_already_registered'; END IF;

  IF p_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,
      email_change_token_current,phone_change,phone_change_token,reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), NOW(),
      '', '', '', '', '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', v_full_name, 'role', v_role), NOW(), NOW()
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', NOW(), NOW(), NOW()
    ) ON CONFLICT DO NOTHING;
  ELSE
    SELECT role INTO v_existing_role FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

    IF v_user_id = v_actor AND v_role NOT IN ('admin', 'both') THEN RAISE EXCEPTION 'cannot_remove_own_admin_access'; END IF;
    IF v_user_id = v_actor AND v_existing_role IN ('admin', 'both') AND p_password IS NOT NULL AND v_password <> '' THEN
      RAISE EXCEPTION 'cannot_change_own_admin_password';
    END IF;

    UPDATE auth.users
    SET email = v_email,
        encrypted_password = CASE
          WHEN p_password IS NOT NULL AND v_password <> '' THEN extensions.crypt(v_password, extensions.gen_salt('bf'))
          ELSE encrypted_password
        END,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_full_name, 'role', v_role),
        updated_at = NOW()
    WHERE id = v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'auth_user_not_found'; END IF;

    UPDATE auth.identities
    SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email, 'email_verified', true),
        updated_at = NOW()
    WHERE user_id = v_user_id AND provider = 'email';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (v_user_id, v_email, v_full_name, v_role, v_ti)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, ti = EXCLUDED.ti, updated_at = NOW();

  IF v_role IN ('parent', 'student_parent') THEN
    SELECT id INTO v_existing_parent_link
    FROM public.parent_student_links
    WHERE parent_user_id = v_user_id AND active = true
    ORDER BY created_at ASC LIMIT 1;

    IF v_code <> '' THEN
      SELECT id, student_user_id INTO v_code_id, v_student
      FROM public.family_link_codes
      WHERE code = v_code AND used_at IS NULL AND expires_at > now()
      FOR UPDATE;
      IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_student_code'; END IF;
      IF v_student = v_user_id THEN RAISE EXCEPTION 'invalid_family_link'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_student AND role IN ('student', 'both', 'student_parent') AND active = true
      ) THEN RAISE EXCEPTION 'invalid_student_code'; END IF;

      SELECT count(*) INTO v_student_parent_count
      FROM public.parent_student_links
      WHERE student_user_id = v_student AND active = true AND parent_user_id <> v_user_id;
      IF v_student_parent_count >= 2 THEN RAISE EXCEPTION 'student_parent_limit_reached'; END IF;

      SELECT count(*) INTO v_parent_child_count
      FROM public.parent_student_links
      WHERE parent_user_id = v_user_id AND active = true AND student_user_id <> v_student;
      IF v_parent_child_count >= 4 THEN RAISE EXCEPTION 'parent_child_limit_reached'; END IF;

      INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
      VALUES (v_user_id, v_student, COALESCE(v_relationship, 'Acudiente'), true)
      ON CONFLICT (parent_user_id, student_user_id)
      DO UPDATE SET relationship = EXCLUDED.relationship, active = true;

      UPDATE public.family_link_codes SET used_at = now(), used_by_parent_user_id = v_user_id WHERE id = v_code_id;
    ELSIF v_existing_parent_link IS NULL THEN
      RAISE EXCEPTION 'student_code_required_for_parent';
    ELSIF v_relationship IS NOT NULL THEN
      UPDATE public.parent_student_links SET relationship = v_relationship WHERE id = v_existing_parent_link;
    END IF;
  END IF;

  RETURN v_user_id;
END;
$function$;
