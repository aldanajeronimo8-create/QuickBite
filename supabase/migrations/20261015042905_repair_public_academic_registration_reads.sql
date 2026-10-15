-- Keep this migration in sync with the production repair applied on 2026-10-15.
-- Anonymous visitors may read active academic options for registration. Administrative
-- writes still require an authenticated admin and never expose is_admin() to anon.
BEGIN;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS academic_sections_public_read ON public.academic_sections;
CREATE POLICY academic_sections_public_read
  ON public.academic_sections
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS academic_sections_admin_write ON public.academic_sections;
CREATE POLICY academic_sections_admin_write
  ON public.academic_sections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS academic_grades_public_read ON public.academic_grades;
CREATE POLICY academic_grades_public_read
  ON public.academic_grades
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS academic_grades_admin_write ON public.academic_grades;
CREATE POLICY academic_grades_admin_write
  ON public.academic_grades
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS academic_courses_public_read ON public.academic_courses;
CREATE POLICY academic_courses_public_read
  ON public.academic_courses
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS academic_courses_admin_write ON public.academic_courses;
CREATE POLICY academic_courses_admin_write
  ON public.academic_courses
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
