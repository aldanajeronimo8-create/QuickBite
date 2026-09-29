-- Final permission normalization after Phase 2.
-- These grants preserve only the pre-auth/public behavior needed by registration.
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_student_link_code(text) TO anon;
REVOKE EXECUTE ON FUNCTION public.email_exists(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_student_link_code(text) TO authenticated;
