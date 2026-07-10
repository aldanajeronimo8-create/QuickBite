-- ============================================================
-- QuickBite — apply ALL pending migrations in one paste.
-- Use when migrations 2-4 have NOT yet been applied.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

-- ── Migration 2: TI column + profile RPCs ───────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ti TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_ti_unique' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_ti_unique UNIQUE (ti);
  END IF;
END $$;

-- email_exists: anon-safe check used by forgot-password page.
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

-- create_student_profile: inserts student row.
-- When the caller has a session (email-confirm disabled), auth.uid() must match p_user_id.
-- When auth.uid() is null (email-confirm enabled, caller is anon right after signUp), the
-- check is skipped — the only way to supply a valid UUID is to have just called signUp.
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
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE ti = trim(p_ti)) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'student', trim(p_ti));
END;
$$;
REVOKE ALL ON FUNCTION public.create_student_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_profile(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── Migration 3: secure app_secrets table + admin invite RPC ─

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;

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

-- create_admin_profile: server-side invite code validation.
-- Requires an active session; auth.uid() must match p_user_id.
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
  v_stored_code TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';
  IF v_admin_count > 0 THEN
    IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
      RAISE EXCEPTION 'invite_code_required';
    END IF;
    SELECT value INTO v_stored_code FROM public.app_secrets WHERE key = 'admin_invite_code';
    IF v_stored_code IS NULL THEN
      RAISE EXCEPTION 'invite_code_not_configured';
    END IF;
    IF trim(p_invite_code) <> v_stored_code THEN
      RAISE EXCEPTION 'invite_code_invalid';
    END IF;
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'admin')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
        role = 'admin', updated_at = NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_profile(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── No Migration 4 ───────────────────────────────────────────
-- Password reset uses Supabase's built-in email-link flow.
-- No custom reset_user_password RPC or shared reset codes needed.
-- ForgotPasswordPage calls supabase.auth.resetPasswordForEmail()
-- and ResetPasswordPage handles the PASSWORD_RECOVERY event.

-- ── Post-setup: configure your admin invite code ─────────────
-- Run this once you decide on your code:
--
--   SELECT set_admin_invite_code('tu-codigo-secreto-admin');

-- Order archive visibility for admin UI.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_admin_hidden_created_at
  ON public.orders(admin_hidden, created_at DESC);
