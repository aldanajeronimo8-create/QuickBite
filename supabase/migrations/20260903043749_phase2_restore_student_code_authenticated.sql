-- Student registration may validate an existing link code after authentication.
GRANT EXECUTE ON FUNCTION public.validate_student_link_code(text) TO authenticated;
