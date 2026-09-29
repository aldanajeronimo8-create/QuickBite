-- Keep the operational snapshot field names aligned with the Admin UI.
CREATE OR REPLACE FUNCTION public.get_system_operational_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_health JSONB;
  v_persistence_at timestamptz;
  v_automation_at timestamptz;
  v_audit_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.checked_at DESC), '[]'::jsonb)
  INTO v_health
  FROM (
    SELECT DISTINCT ON (service) service, status, latency_ms, checked_at, details
    FROM public.system_health_checks
    ORDER BY service, checked_at DESC
    LIMIT 12
  ) AS h;

  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM public.orders), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM public.products), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM public.profiles), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.orders), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.products), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.profiles), '-infinity'::timestamptz)
  ) INTO v_persistence_at;

  SELECT GREATEST(
    COALESCE((SELECT MAX(checked_at) FROM public.system_health_checks), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(started_at) FROM public.automation_jobs), '-infinity'::timestamptz)
  ) INTO v_automation_at;

  SELECT MAX(created_at) INTO v_audit_at FROM public.system_audit_logs;

  RETURN jsonb_build_object(
    'health', v_health,
    'audit_events', (SELECT COUNT(*) FROM public.system_audit_logs),
    'open_alerts', (SELECT COUNT(*) FROM public.system_alerts WHERE resolved_at IS NULL),
    'failed_jobs', (SELECT COUNT(*) FROM public.automation_jobs WHERE status = 'failed'),
    'active_automations', (SELECT COUNT(*) FROM public.automation_settings WHERE enabled = true),
    'persistence_last_activity_at', NULLIF(v_persistence_at, '-infinity'::timestamptz),
    'automation_last_execution_at', NULLIF(v_automation_at, '-infinity'::timestamptz),
    'audit_last_event_at', v_audit_at
  );
END;
$$;
