-- Keep the GitHub E2E verification account protected in production as well as in the client allowlist.
INSERT INTO public.protected_admins (email, full_name)
VALUES ('quickbitejgf@gmail.com', 'E2E Verificacion Github')
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name;
