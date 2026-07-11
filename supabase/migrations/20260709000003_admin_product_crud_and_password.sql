-- QuickBite: production RPCs for admin product CRUD and robust password/user recovery.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_secrets (key, value)
VALUES ('password_reset_code', '29062025')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE email = v_email)
    OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.email_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_email        TEXT,
  p_reset_code   TEXT,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email       TEXT := lower(trim(p_email));
  v_user_id     UUID;
  v_stored_code TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE email = v_email
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'email_not_found';
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

REVOKE ALL ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_product(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_price NUMERIC DEFAULT 0,
  p_image_url TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_stock INTEGER DEFAULT 0,
  p_available BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'product_name_required';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;

  IF p_stock IS NULL OR p_stock < 0 THEN
    RAISE EXCEPTION 'invalid_stock';
  END IF;

  INSERT INTO public.products (
    name,
    description,
    price,
    image_url,
    category_id,
    stock,
    available
  )
  VALUES (
    trim(p_name),
    p_description,
    p_price,
    NULLIF(trim(COALESCE(p_image_url, '')), ''),
    p_category_id,
    p_stock,
    COALESCE(p_available, TRUE)
  )
  RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_product(
  p_product_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_price NUMERIC DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_stock INTEGER DEFAULT NULL,
  p_available BOOLEAN DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_name IS NOT NULL AND trim(p_name) = '' THEN
    RAISE EXCEPTION 'product_name_required';
  END IF;

  IF p_price IS NOT NULL AND p_price < 0 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;

  IF p_stock IS NOT NULL AND p_stock < 0 THEN
    RAISE EXCEPTION 'invalid_stock';
  END IF;

  UPDATE public.products
  SET name = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
      description = COALESCE(p_description, description),
      price = COALESCE(p_price, price),
      image_url = COALESCE(p_image_url, image_url),
      category_id = COALESCE(p_category_id, category_id),
      stock = COALESCE(p_stock, stock),
      available = COALESCE(p_available, available),
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING id INTO v_product_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_product(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_product(TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_product(UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_product(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_product(TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_product(UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_ti TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role NOT IN ('admin', 'student') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN
    RAISE EXCEPTION 'ti_required';
  END IF;

  IF p_password IS NOT NULL AND trim(p_password) <> '' AND length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE ti = trim(p_ti)
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE email = v_email
      AND id <> p_user_id
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = v_email
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'email_already_registered';
  END IF;

  UPDATE auth.users
  SET email = v_email,
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND trim(p_password) <> ''
          THEN extensions.crypt(p_password, extensions.gen_salt('bf'))
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
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'student',
  p_ti TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role NOT IN ('admin', 'student') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN
    RAISE EXCEPTION 'ti_required';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
      NOW(),
      NOW()
    );

    INSERT INTO auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE ti = trim(p_ti)
      AND id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (v_user_id, v_email, trim(p_full_name), v_role, NULLIF(trim(COALESCE(p_ti, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        ti = EXCLUDED.ti,
        updated_at = NOW();

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
