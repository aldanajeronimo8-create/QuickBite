-- Canonical all-access role for trusted protected accounts.
-- Existing role values remain supported for backward compatibility.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin','student','parent','staff','both','student_parent','all']::text[]));

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_protected_admin_email(OLD.email) THEN
    -- Only the one-time admin -> all role promotion is permitted.
    -- Email and every other profile field remain immutable.
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM 'all'
       OR OLD.role IS DISTINCT FROM 'admin'
       OR (to_jsonb(NEW) - 'role' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'role' - 'updated_at') THEN
      RAISE EXCEPTION 'protected_account_cannot_be_changed';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
