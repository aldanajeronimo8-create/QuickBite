BEGIN;

REVOKE EXECUTE ON FUNCTION public.link_student_by_code(text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
