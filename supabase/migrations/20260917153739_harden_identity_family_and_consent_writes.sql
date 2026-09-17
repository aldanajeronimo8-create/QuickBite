BEGIN;

REVOKE INSERT ON public.profiles FROM anon, authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS parent_student_insert_related ON public.parent_student_links;
DROP POLICY IF EXISTS parent_student_update_related ON public.parent_student_links;
DROP POLICY IF EXISTS parent_student_delete_related ON public.parent_student_links;
REVOKE INSERT, UPDATE, DELETE ON public.parent_student_links FROM anon, authenticated;

DROP POLICY IF EXISTS "student can create own data consent" ON public.student_data_consents;
REVOKE INSERT ON public.student_data_consents FROM anon, authenticated;
REVOKE UPDATE ON public.student_data_consents FROM anon, authenticated;
GRANT UPDATE (revoked_at) ON public.student_data_consents TO authenticated;

COMMIT;
