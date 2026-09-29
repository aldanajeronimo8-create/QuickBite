-- Secure operational snapshot for the admin system dashboard.
-- The audit/health tables intentionally have no direct browser grants;
-- the dashboard must use this authenticated, admin-only RPC.

CREATE OR REPLACE FUNCTION public.get_system_operational_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_health JSONB;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.checked_at DESC), '[]'::jsonb)
  INTO v_health
  FROM (
    SELECT DISTINCT ON (service)
      service, status, latency_ms, checked_at, details
    FROM public.system_health_checks
    ORDER BY service, checked_at DESC
    LIMIT 12
  ) AS h;

  v_result := jsonb_build_object(
    'health', v_health,
    'audit_events', (SELECT COUNT(*) FROM public.system_audit_logs),
    'open_alerts', (SELECT COUNT(*) FROM public.system_alerts WHERE resolved_at IS NULL),
    'failed_jobs', (SELECT COUNT(*) FROM public.automation_jobs WHERE status = 'failed'),
    'active_automations', (SELECT COUNT(*) FROM public.automation_settings WHERE enabled = true)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_operational_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_operational_snapshot() TO authenticated;

-- Run an immediate, authenticated database health probe from the admin UI.
-- This removes the dependency on a background job having run before the page
-- can show a real status.
CREATE OR REPLACE FUNCTION public.run_admin_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_started TIMESTAMPTZ := clock_timestamp();
  v_latency INTEGER;
  v_status TEXT := 'healthy';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  PERFORM 1 FROM public.products LIMIT 1;
  v_latency := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::INTEGER);

  PERFORM public.record_system_health_check(
    'supabase_database', 'healthy', v_latency,
    jsonb_build_object('check', 'admin_database_query', 'result', 'ok')
  );

  RETURN jsonb_build_object(
    'service', 'supabase_database',
    'status', v_status,
    'latency_ms', v_latency,
    'checked_at', clock_timestamp()
  );
EXCEPTION WHEN OTHERS THEN
  v_latency := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::INTEGER);
  -- The service-role-only writer cannot be called by an authenticated admin;
  -- return the real failure without exposing database internals.
  RETURN jsonb_build_object(
    'service', 'supabase_database',
    'status', 'unhealthy',
    'latency_ms', v_latency,
    'checked_at', clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_admin_health_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_admin_health_check() TO authenticated;
