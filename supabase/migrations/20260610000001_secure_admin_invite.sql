-- QuickBite: harden admin invite-code validation server-side.
-- Apply in Supabase dashboard: SQL Editor → paste → Run.
--
-- HOW TO SET THE INVITE CODE:
--   Run this once in SQL Editor (replace 'your-secret-code' with your actual code):
--     SELECT set_admin_invite_code('your-secret-code');
--
-- To clear the code (bootstrap mode, first admin only):
--     SELECT set_admin_invite_code('');

-- 1. Secure table to hold the invite code — not readable by any role directly.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Revoke all direct access; only SECURITY DEFINER functions may read/write.
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;

-- 2. Helper to set the admin invite code (callable by service role / superuser only).
CREATE OR REPLACE FUNCTION public.set_admin_invite_code(p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code = '' THEN
    DELETE FROM public.app_secrets WHERE key = 'admin_invite_code';
  ELSE
    INSERT INTO public.app_secrets (key, value)
    VALUES ('admin_invite_code', p_code)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_invite_code(TEXT) FROM PUBLIC;
-- Only service-role / postgres superuser can call this.
-- (No GRANT to anon or authenticated.)

-- 3. Replace create_admin_profile with server-side invite code validation.
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
  v_admin_count     INTEGER;
  v_stored_code     TEXT;
BEGIN
  -- Verify the auth user exists.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';

  IF v_admin_count > 0 THEN
    -- Non-bootstrap: invite code is required.
    IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
      RAISE EXCEPTION 'invite_code_required';
    END IF;

    -- Validate against the server-stored code.
    SELECT value INTO v_stored_code FROM public.app_secrets WHERE key = 'admin_invite_code';

    IF v_stored_code IS NULL THEN
      -- No code has been configured — deny access until one is set.
      RAISE EXCEPTION 'invite_code_not_configured';
    END IF;

    IF trim(p_invite_code) <> v_stored_code THEN
      RAISE EXCEPTION 'invite_code_invalid';
    END IF;
  END IF;
  -- v_admin_count = 0 → bootstrap: first admin is created freely.

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'admin')
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role      = 'admin',
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
