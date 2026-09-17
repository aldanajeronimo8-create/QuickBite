BEGIN;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

COMMIT;
