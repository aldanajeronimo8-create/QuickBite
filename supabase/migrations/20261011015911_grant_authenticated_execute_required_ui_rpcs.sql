-- Restore only the RPCs observed failing in destination E2E.
-- Administrative RPCs enforce public.is_admin() internally.
-- Student-code RPC validates auth.uid(), student role, and parent/admin linkage.
GRANT EXECUTE ON FUNCTION public.get_system_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_student_code(boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_protected_admin_emails() TO authenticated;
