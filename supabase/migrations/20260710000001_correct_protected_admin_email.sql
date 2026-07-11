-- Correct a protected administrator email that was provisioned with a typo.
DELETE FROM public.protected_admins
WHERE email = 'useche.iego@maximino.edu.co';

INSERT INTO public.protected_admins (email, full_name)
VALUES ('useche.diego@maximino.edu.co', 'Diego Useche')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;
