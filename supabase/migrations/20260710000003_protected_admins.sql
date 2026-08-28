-- Protected administrator accounts. Their credentials are provisioned only by
-- scripts/provision-protected-admins.mjs with a server-side secret.

CREATE TABLE IF NOT EXISTS public.protected_admins (
  email TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.protected_admins (email, full_name)
VALUES
  ('colmenares.juan@maximino.edu.co', 'Juan Colmenares'),
  ('aldana.jeronimo@maximino.edu.co', 'Jeronimo Aldana'),
  ('jeronimoaldana901@gmail.com', 'Jeronimo Aldana 901'),
  ('fernandez.gabriel@maximino.edu.co', 'Gabriel Fernandez'),
  ('useche.diego@maximino.edu.co', 'Diego Useche')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;

CREATE OR REPLACE FUNCTION public.is_protected_admin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protected_admins
    WHERE email = lower(trim(p_email))
  );
$$;

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
    RAISE EXCEPTION 'protected_admin_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_protected_admin_email(OLD.email)
     AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.role IS DISTINCT FROM 'admin') THEN
    RAISE EXCEPTION 'protected_admin_identity_cannot_be_changed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_admins ON public.profiles;
CREATE TRIGGER profiles_protect_admins
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_admin_profile_change();

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

  IF TG_OP = 'DELETE' AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_admin_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_protected_admin_email(OLD.email)
     AND (
       NEW.email IS DISTINCT FROM OLD.email
       OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
       OR NEW.banned_until IS DISTINCT FROM OLD.banned_until
     ) THEN
    RAISE EXCEPTION 'protected_admin_auth_cannot_be_changed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS auth_users_protect_admins ON auth.users;
CREATE TRIGGER auth_users_protect_admins
BEFORE UPDATE OR DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_admin_auth_change();

ALTER TABLE public.protected_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.protected_admins FROM anon, authenticated;
