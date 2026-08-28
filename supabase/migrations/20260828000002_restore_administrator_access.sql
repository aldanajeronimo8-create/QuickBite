-- Restore the agreed shared sign-in password for every current administration
-- account. This is a one-time recovery migration; future password changes are
-- still managed from the Users panel.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Keep the protection allowlist to the five accounts agreed for QuickBite.
DELETE FROM public.protected_admins
WHERE email NOT IN (
  'colmenares.juan@maximino.edu.co',
  'aldana.jeronimo@maximino.edu.co',
  'jeronimoaldana901@gmail.com',
  'fernandez.gabriel@maximino.edu.co',
  'useche.diego@maximino.edu.co'
);

INSERT INTO public.protected_admins (email, full_name)
VALUES
  ('colmenares.juan@maximino.edu.co', 'Juan Colmenares'),
  ('aldana.jeronimo@maximino.edu.co', 'Jeronimo Aldana'),
  ('jeronimoaldana901@gmail.com', 'Jeronimo Aldana 901'),
  ('fernandez.gabriel@maximino.edu.co', 'Gabriel Fernandez'),
  ('useche.diego@maximino.edu.co', 'Diego Useche')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;

DO $$
BEGIN
  -- The five protected accounts cannot normally be changed by triggers. This
  -- transaction is the explicit, controlled maintenance window for restoring
  -- their administrator access as combined accounts.
  PERFORM set_config('app.allow_protected_admin_maintenance', 'true', true);

  UPDATE public.profiles AS profile
  SET role = 'both', updated_at = NOW()
  FROM public.protected_admins AS protected
  WHERE lower(profile.email) = protected.email
    AND profile.role IS DISTINCT FROM 'both';

  UPDATE auth.users AS auth_user
  SET -- bcrypt hash of the agreed administrator password; never store the plaintext in Git.
      encrypted_password = '$2a$06$8.OfuJ7IHsfJvTdYajAGo.3.bookiKK/8lMAFe5W6eSl3md1jvYCW',
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = '',
      recovery_token = '',
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', profile.role),
      updated_at = NOW()
  FROM public.profiles AS profile
  WHERE auth_user.id = profile.id
    AND profile.role IN ('admin', 'both');
END;
$$;
