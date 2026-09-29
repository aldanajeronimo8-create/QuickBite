-- Restore the executor permission required by PostgREST for the db_pre_request hook.
-- The hook remains non-callable by anon/authenticated; only the PostgREST
-- authenticator role may execute it as part of each Data API request.
GRANT EXECUTE ON FUNCTION public.db_pre_request() TO authenticator;
NOTIFY pgrst, 'reload config';
