CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_ti text DEFAULT NULL::text,
  p_password text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
  v_target_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT role INTO v_target_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_user_id = auth.uid()
     AND COALESCE(v_target_role, v_role) IN ('admin', 'both')
     AND p_password IS NOT NULL
     AND trim(p_password) <> '' THEN
    RAISE EXCEPTION 'administrative_self_password_change_not_allowed';
  END IF;

  IF v_role NOT IN ('admin', 'student', 'both') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF trim(COALESCE(p_full_name, '')) = '' OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_user_details';
  END IF;

  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN
    RAISE EXCEPTION 'ti_required';
  END IF;

  IF p_password IS NOT NULL AND trim(p_password) <> '' AND length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE ti = trim(p_ti)
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(email) = v_email
      AND id <> p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = v_email
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  UPDATE auth.users
  SET email = v_email,
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND trim(p_password) <> ''
          THEN extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
        ELSE encrypted_password
      END,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  UPDATE auth.identities
  SET identity_data = identity_data
        || jsonb_build_object('email', v_email, 'email_verified', true),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND provider = 'email';

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (p_user_id, v_email, trim(p_full_name), v_role, NULLIF(trim(COALESCE(p_ti, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        ti = EXCLUDED.ti,
        updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.is_protected_admin_email(OLD.email) THEN
      IF (to_jsonb(NEW) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at'])
           IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at']) THEN
        RAISE EXCEPTION 'protected_account_cannot_be_changed';
      END IF;
    END IF;

    IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
       AND auth.uid() = OLD.id
       AND EXISTS (
         SELECT 1
         FROM public.profiles
         WHERE id = OLD.id
           AND role IN ('admin', 'both')
       ) THEN
      RAISE EXCEPTION 'administrative_self_password_change_not_allowed';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
