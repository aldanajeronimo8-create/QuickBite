-- GoTrue completes the account confirmation on a protected account's first
-- password session. These are Auth bookkeeping fields only; all identity and
-- credential data remains immutable.

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

  -- Supabase Auth updates these values when it verifies and issues a session.
  -- Comparing every other field protects email, role metadata, password,
  -- suspension state and every future account-identity field by default.
  IF (to_jsonb(NEW) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at']) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_changed';
  END IF;

  RETURN NEW;
END;
$$;
