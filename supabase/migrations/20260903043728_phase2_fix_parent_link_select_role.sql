-- Restrict parent/student relationship reads to authenticated callers.
DROP POLICY IF EXISTS parent_student_select_related ON public.parent_student_links;
CREATE POLICY parent_student_select_related ON public.parent_student_links
FOR SELECT TO authenticated
USING ((auth.uid() = parent_user_id) OR (auth.uid() = student_user_id));
