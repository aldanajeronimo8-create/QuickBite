CREATE OR REPLACE FUNCTION public.db_pre_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_method text := current_setting('request.method', true);
  v_path text := current_setting('request.path', true);
  v_headers jsonb := COALESCE(
    NULLIF(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_rpc_name text;
  v_bucket text;
  v_client_ip text;
  v_actor text;
  v_route text;
  v_now timestamptz := clock_timestamp();
  v_limit constant integer := 300;
  v_window constant interval := interval '5 minutes';
  v_count integer;
BEGIN
  IF v_method NOT IN ('POST', 'PATCH', 'PUT', 'DELETE') THEN
    RETURN;
  END IF;

  IF v_path LIKE '/rpc/%' THEN
    v_rpc_name := nullif(split_part(split_part(v_path, '/rpc/', 2), '?', 1), '');
    IF v_rpc_name IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = v_rpc_name
           AND p.provolatile = 'v'
       ) THEN
      RETURN;
    END IF;
  END IF;

  -- PostgREST exposes headers as request.headers JSON. Reading unsupported
  -- three-part GUCs such as request.header.x-forwarded-for silently yields NULL.
  v_client_ip := COALESCE(
    NULLIF(v_headers ->> 'x-forwarded-for', ''),
    NULLIF(v_headers ->> 'cf-connecting-ip', ''),
    'unknown'
  );
  v_client_ip := left(split_part(v_client_ip, ',', 1), 128);

  -- Partition by IP + authenticated actor + endpoint so shared school/NAT IPs
  -- don't serialize unrelated users and routes behind one row lock.
  v_actor := COALESCE(NULLIF(auth.uid()::text, ''), 'anon');
  v_route := left(
    split_part(COALESCE(NULLIF(v_path, ''), '/unknown'), '?', 1),
    128
  );
  v_bucket := v_client_ip || '|' || left(v_actor, 64) || '|' || v_route;

  INSERT INTO public.api_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  VALUES(v_bucket, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = CASE
      WHEN public.api_rate_limits.window_started_at + v_window <= v_now THEN 1
      ELSE public.api_rate_limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.api_rate_limits.window_started_at + v_window <= v_now THEN v_now
      ELSE public.api_rate_limits.window_started_at
    END,
    updated_at = v_now
  RETURNING request_count INTO v_count;

  IF v_count > v_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'rate_limit_exceeded',
      DETAIL = 'Too many write requests for this route. Try again later.';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.db_pre_request() IS
  'QuickBite Data API write rate limit: 300 requests per 5 minutes per client IP, actor and route. Uses PostgREST request.headers JSON and avoids global row-lock contention.';
