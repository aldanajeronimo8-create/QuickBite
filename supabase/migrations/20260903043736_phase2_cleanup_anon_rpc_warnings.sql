-- Keep public lookup RPCs available only where the application needs pre-auth registration.
REVOKE EXECUTE ON FUNCTION public.email_exists(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_student_link_code(text) FROM authenticated;
