-- Fix the admin health probe so it writes directly through its SECURITY DEFINER
-- context. The generic health writer is intentionally service-role-only.

CREATE OR REPLACE FUNCTION public.run_admin_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_started TIMESTAMPTZ := clock_timestamp();
  v_latency INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  BEGIN
    PERFORM 1 FROM public.products LIMIT 1;
    v_latency := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::INTEGER);

    INSERT INTO public.system_health_checks (service, status, latency_ms, details)
    VALUES (
      'supabase_database',
      'healthy',
      v_latency,
      jsonb_build_object('check', 'admin_database_query', 'result', 'ok')
    );

    RETURN jsonb_build_object(
      'service', 'supabase_database',
      'status', 'healthy',
      'latency_ms', v_latency,
      'checked_at', clock_timestamp()
    );
  EXCEPTION WHEN OTHERS THEN
    v_latency := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::INTEGER);
    INSERT INTO public.system_health_checks (service, status, latency_ms, details)
    VALUES (
      'supabase_database',
      'unhealthy',
      v_latency,
      jsonb_build_object('check', 'admin_database_query', 'result', 'failed')
    );
    RETURN jsonb_build_object(
      'service', 'supabase_database',
      'status', 'unhealthy',
      'latency_ms', v_latency,
      'checked_at', clock_timestamp()
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.run_admin_health_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_admin_health_check() TO authenticated;
