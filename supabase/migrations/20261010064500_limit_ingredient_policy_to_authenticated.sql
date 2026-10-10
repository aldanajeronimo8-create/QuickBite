-- Anonymous catalog reads need no access to individual student restriction rows.
-- The existing all-command false policy keeps direct anonymous reads empty; only authenticated users
-- may evaluate the scoped SELECT policy and inspect restrictions for a student they are allowed to manage.
DROP POLICY IF EXISTS student_ingredient_blocks_select_effective_student
  ON public.student_ingredient_blocks;
CREATE POLICY student_ingredient_blocks_select_effective_student
  ON public.student_ingredient_blocks
  FOR SELECT
  TO authenticated
  USING (public.can_manage_student_food(student_user_id));
