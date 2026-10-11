GRANT EXECUTE ON FUNCTION public.admin_moderate_order_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_system_audit_event(text, text, text, jsonb, text) TO authenticated;
