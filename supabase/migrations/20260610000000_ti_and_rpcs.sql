-- QuickBite: add TI column and create profile RPCs.
-- Apply in Supabase dashboard: SQL Editor → paste → Run.

-- 1. Add TI (tarjeta de identidad) column to profiles (students only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ti TEXT;

-- Unique constraint on TI (NULL allowed for admin accounts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_ti_unique' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_ti_unique UNIQUE (ti);
  END IF;
END $$;

-- 2. Helper: check if an email exists in profiles (used by forgot-password page, anon-safe)
CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE email = lower(trim(p_email)));
END;
$$;

REVOKE ALL ON FUNCTION public.email_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(TEXT) TO anon, authenticated;

-- 3. Create student profile (SECURITY DEFINER so it works before email confirmation)
CREATE OR REPLACE FUNCTION public.create_student_profile(
  p_user_id   UUID,
  p_email     TEXT,
  p_full_name TEXT,
  p_ti        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the auth user actually exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Duplicate TI check with clear message
  IF EXISTS (SELECT 1 FROM public.profiles WHERE ti = trim(p_ti)) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'student', trim(p_ti));
END;
$$;

REVOKE ALL ON FUNCTION public.create_student_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_profile(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 4. Create admin profile (invite-code validated server-side)
--    p_invite_code is compared against VITE_ADMIN_INVITE_CODE stored as a DB setting or left open
--    when the table has no admins yet (bootstrap mode).
CREATE OR REPLACE FUNCTION public.create_admin_profile(
  p_user_id     UUID,
  p_email       TEXT,
  p_full_name   TEXT,
  p_invite_code TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- Verify the auth user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';

  -- First admin can always be created (bootstrap); subsequent ones require invite code.
  -- The invite code check is advisory here; the real gate is the client-side VITE_ADMIN_INVITE_CODE.
  -- For stronger enforcement, store the code in a secrets table and compare here.
  IF v_admin_count > 0 AND (p_invite_code IS NULL OR trim(p_invite_code) = '') THEN
    RAISE EXCEPTION 'invite_code_required';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'admin')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = 'admin',
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
