-- Protected accounts are immutable to administrators, but Supabase Auth itself
-- updates last_sign_in_at and updated_at on every successful password login.
-- Permit only those two technical fields so protected accounts can authenticate.

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT public.is_protected_admin_email(OLD.email) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  -- GoTrue changes these fields when issuing a password session. Every other
  -- auth.users field remains protected, including the email and password.
  IF (to_jsonb(NEW) - ARRAY['last_sign_in_at', 'updated_at'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['last_sign_in_at', 'updated_at']) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_changed';
  END IF;

  RETURN NEW;
END;
$$;
