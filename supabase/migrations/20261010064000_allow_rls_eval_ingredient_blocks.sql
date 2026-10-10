-- The products SELECT policy must be able to evaluate its ingredient subquery.
-- Allow only scoped reads of the current student's restriction rows; all direct writes remain denied.
GRANT SELECT ON public.student_ingredient_blocks TO anon, authenticated;

DROP POLICY IF EXISTS student_ingredient_blocks_select_effective_student
  ON public.student_ingredient_blocks;
CREATE POLICY student_ingredient_blocks_select_effective_student
  ON public.student_ingredient_blocks
  FOR SELECT
  TO anon, authenticated
  USING (public.can_manage_student_food(student_user_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.student_ingredient_blocks FROM anon, authenticated;
