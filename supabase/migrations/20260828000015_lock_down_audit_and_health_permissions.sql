-- The original audit/health tables were created by an earlier deployment with
-- broad explicit grants. RLS alone is not sufficient when the table itself is
-- visible to anon/authenticated roles, so access is now exclusively via the
-- narrowly authorised RPCs below.

REVOKE ALL ON TABLE public.system_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.system_health_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.system_audit_logs TO service_role;
GRANT ALL ON TABLE public.system_health_checks TO service_role;

-- Compatibility functions from the older infrastructure are not used by the
-- application. Keep them for historical dependencies, but do not expose them
-- through PostgREST to browsers.
REVOKE ALL ON FUNCTION public.record_health_check(TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_system_audit(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_system_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_system_health_check(TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_system_audit_event(TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_system_health_check(TEXT, TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_system_audit_event(TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_health_summary() TO authenticated;
