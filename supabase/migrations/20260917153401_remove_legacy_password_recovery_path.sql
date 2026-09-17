BEGIN;

DROP FUNCTION IF EXISTS public.reset_user_password(text, text, text);
DROP FUNCTION IF EXISTS public.reset_password_with_ti(text, text, text);
DELETE FROM public.app_secrets WHERE key = 'password_reset_code';
REVOKE EXECUTE ON FUNCTION public.email_exists(text) FROM PUBLIC, anon, authenticated;

COMMIT;
