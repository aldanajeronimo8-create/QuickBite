-- Connect the Data API write limiter to PostgREST and retire legacy password-reset RPCs.
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.db_pre_request';
NOTIFY pgrst, 'reload config';

REVOKE EXECUTE ON FUNCTION public.reset_password_with_ti(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_user_password(text,text,text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.db_pre_request() IS 'QuickBite Data API write rate limit: 300 requests per 5 minutes per client IP; installed as PostgREST db_pre_request hook.';
