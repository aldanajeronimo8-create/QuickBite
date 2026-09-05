-- QuickBite: admin-managed account roles + reliable admin CRUD.
-- Roles supported by the admin UI:
--   student, admin, parent, both (student + admin), student_parent (student + parent).

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'student', 'parent', 'both', 'student_parent'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'both')
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_manage_user(
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'student',
  p_ti TEXT DEFAULT NULL,
  p_student_code TEXT DEFAULT NULL,
  p_relationship TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF v_full_name = '' THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;
  IF v_role NOT IN ('admin', 'student', 'parent', 'both', 'student_parent') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF p_user_id IS NULL AND length(v_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;
  IF p_user_id IS NOT NULL AND p_password IS NOT NULL AND v_password <> '' AND length(v_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF v_role IN ('student', 'both', 'student_parent') AND v_ti IS NULL THEN
    RAISE EXCEPTION 'ti_required';
  END IF;
  IF v_role IN ('admin', 'parent') THEN
    v_ti := NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(email) = v_email AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) OR EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  IF v_ti IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE ti = v_ti AND id <> COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  IF p_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), NOW(),
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

    IF v_user_id = v_actor AND v_role NOT IN ('admin', 'both') THEN
      RAISE EXCEPTION 'cannot_remove_own_admin_access';
    END IF;
    IF v_user_id = v_actor AND v_existing_role IN ('admin', 'both') AND p_password IS NOT NULL AND v_password <> '' THEN
      RAISE EXCEPTION 'cannot_change_own_admin_password';
    END IF;

    UPDATE auth.users
    SET email = v_email,
        encrypted_password = CASE
          WHEN p_password IS NOT NULL AND v_password <> ''
            THEN extensions.crypt(v_password, extensions.gen_salt('bf'))
          ELSE encrypted_password
        END,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', v_full_name, 'role', v_role),
        updated_at = NOW()
    WHERE id = v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'auth_user_not_found'; END IF;

    UPDATE auth.identities
    SET identity_data = COALESCE(identity_data, '{}'::jsonb)
      || jsonb_build_object('email', v_email, 'email_verified', true),
        updated_at = NOW()
    WHERE user_id = v_user_id AND provider = 'email';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (v_user_id, v_email, v_full_name, v_role, v_ti)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        ti = EXCLUDED.ti,
        updated_at = NOW();

  IF v_role IN ('parent', 'student_parent') THEN
    SELECT id INTO v_existing_parent_link
    FROM public.parent_student_links
    WHERE parent_user_id = v_user_id AND active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_code <> '' THEN
      SELECT id, student_user_id
      INTO v_code_id, v_student
      FROM public.family_link_codes
      WHERE code = v_code AND used_at IS NULL AND expires_at > now()
      FOR UPDATE;

      IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_student_code'; END IF;
      IF v_student = v_user_id THEN RAISE EXCEPTION 'invalid_family_link'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_student AND role IN ('student', 'both', 'student_parent')) THEN
        RAISE EXCEPTION 'invalid_student_code';
      END IF;

      SELECT count(*) INTO v_student_parent_count
      FROM public.parent_student_links
      WHERE student_user_id = v_student AND active = true
        AND parent_user_id <> v_user_id;
      IF v_student_parent_count >= 2 THEN RAISE EXCEPTION 'student_parent_limit_reached'; END IF;

      SELECT count(*) INTO v_parent_child_count
      FROM public.parent_student_links
      WHERE parent_user_id = v_user_id AND active = true
        AND student_user_id <> v_student;
      IF v_parent_child_count >= 4 THEN RAISE EXCEPTION 'parent_child_limit_reached'; END IF;

      INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
      VALUES (v_user_id, v_student, COALESCE(v_relationship, 'Acudiente'), true)
      ON CONFLICT (parent_user_id, student_user_id)
      DO UPDATE SET relationship = EXCLUDED.relationship, active = true;

      UPDATE public.family_link_codes
      SET used_at = now(), used_by_parent_user_id = v_user_id
      WHERE id = v_code_id;
    ELSIF v_existing_parent_link IS NULL THEN
      RAISE EXCEPTION 'student_code_required_for_parent';
    ELSIF v_relationship IS NOT NULL THEN
      UPDATE public.parent_student_links
      SET relationship = v_relationship
      WHERE id = v_existing_parent_link;
    END IF;
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_parent_to_student(
  p_student_code text,
  p_relationship text DEFAULT 'Acudiente'
)
RETURNS public.parent_student_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_code_id uuid;
  v_link public.parent_student_links;
  v_parent_count integer;
  v_student_parent_count integer;
  v_relationship text := nullif(trim(p_relationship), '');
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_parent AND role IN ('parent','student_parent')) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;
  IF v_relationship IS NULL THEN v_relationship := 'Acudiente'; END IF;
  IF v_relationship NOT IN ('Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Familiar','Otro') THEN
    RAISE EXCEPTION 'invalid_relationship';
  END IF;

  SELECT id, student_user_id INTO v_code_id, v_student
  FROM public.family_link_codes
  WHERE code = upper(trim(p_student_code)) AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_student_code'; END IF;
  IF v_student = v_parent THEN RAISE EXCEPTION 'invalid_family_link'; END IF;

  SELECT count(*) INTO v_student_parent_count FROM public.parent_student_links
  WHERE student_user_id = v_student AND active = true AND parent_user_id <> v_parent;
  IF v_student_parent_count >= 2 THEN RAISE EXCEPTION 'student_parent_limit_reached'; END IF;

  SELECT count(*) INTO v_parent_count FROM public.parent_student_links
  WHERE parent_user_id = v_parent AND active = true AND student_user_id <> v_student;
  IF v_parent_count >= 4 THEN RAISE EXCEPTION 'parent_child_limit_reached'; END IF;

  INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
  VALUES(v_parent, v_student, v_relationship, true)
  ON CONFLICT (parent_user_id, student_user_id)
  DO UPDATE SET relationship=excluded.relationship, active=true
  RETURNING * INTO v_link;

  UPDATE public.family_link_codes SET used_at = now(), used_by_parent_user_id = v_parent WHERE id = v_code_id;
  RETURN v_link;
END;
$$;

REVOKE ALL ON FUNCTION public.link_parent_to_student(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_parent_to_student(text, text) TO authenticated;
