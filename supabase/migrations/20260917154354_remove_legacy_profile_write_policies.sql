BEGIN;

DROP POLICY IF EXISTS profiles_insert_admin_self ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_parent_self ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_student_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;

COMMIT;
