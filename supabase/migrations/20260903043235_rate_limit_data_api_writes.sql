-- Rate-limit write requests at the PostgREST/Data API boundary.
-- The limit is intentionally sized for a school network where many students
-- can share one public IP during a break.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;

CREATE INDEX IF NOT EXISTS api_rate_limits_updated_at_idx
  ON public.api_rate_limits(updated_at);

CREATE OR REPLACE FUNCTION public.db_pre_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_bucket TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_limit CONSTANT INTEGER := 300;
  v_window CONSTANT INTERVAL := INTERVAL '5 minutes';
  v_count INTEGER;
BEGIN
  -- Only throttle write methods. Reads must remain effectively unlimited so
  -- normal menu/order tracking traffic is not impacted.
  IF current_setting('request.method', true) NOT IN ('POST', 'PATCH', 'PUT', 'DELETE') THEN
    RETURN;
  END IF;

  v_bucket := COALESCE(
    NULLIF(current_setting('request.header.x-forwarded-for', true), ''),
    NULLIF(current_setting('request.header.cf-connecting-ip', true), ''),
    'unknown'
  );
  -- Prevent an attacker from turning an arbitrary forwarded-for value into an
  -- unbounded key space: use only the first address and cap its length.
  v_bucket := left(split_part(v_bucket, ',', 1), 128);

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
      DETAIL = 'Too many write requests. Try again later.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.db_pre_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.db_pre_request() TO authenticator;

-- PostgREST executes this hook before each request when configured through the
-- database pre-request hook setting. This SQL remains safe to reapply.
COMMENT ON FUNCTION public.db_pre_request() IS 'QuickBite Data API write rate limit: 300 requests per 5 minutes per client IP.';

-- Remove stale buckets without affecting active windows.
DELETE FROM public.api_rate_limits
WHERE updated_at < clock_timestamp() - INTERVAL '1 day';
