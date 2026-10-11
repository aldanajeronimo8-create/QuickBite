-- Admin-managed students must have a valid academic placement.
-- Validates the placement before delegating account creation to admin_manage_user,
-- then saves section_id / grade_id / course_id atomically in the same transaction.
CREATE OR REPLACE FUNCTION public.admin_manage_user_with_academics(
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT 'student',
  p_ti text DEFAULT NULL,
  p_student_code text DEFAULT NULL,
  p_relationship text DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_grade_id uuid DEFAULT NULL,
  p_course_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_role text := lower(trim(coalesce(p_role, '')));
  v_user_id uuid;
  v_academic_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role IN ('student', 'both', 'student_parent') THEN
    IF p_section_id IS NULL OR p_grade_id IS NULL OR p_course_id IS NULL THEN
      RAISE EXCEPTION 'academic_structure_required';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.academic_sections
      WHERE id = p_section_id AND active = true
    ) THEN
      RAISE EXCEPTION 'invalid_section';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.academic_grades
      WHERE id = p_grade_id AND section_id = p_section_id AND active = true
    ) THEN
      RAISE EXCEPTION 'invalid_grade';
    END IF;

    SELECT g.name || c.name
      INTO v_academic_label
    FROM public.academic_grades g
    JOIN public.academic_courses c ON c.grade_id = g.id
    WHERE g.id = p_grade_id
      AND c.id = p_course_id
      AND c.active = true;

    IF v_academic_label IS NULL THEN
      RAISE EXCEPTION 'invalid_course';
    END IF;
  END IF;

  v_user_id := public.admin_manage_user(
    p_user_id,
    p_email,
    p_password,
    p_full_name,
    p_role,
    p_ti,
    p_student_code,
    p_relationship
  );

  UPDATE public.profiles
  SET section_id = CASE WHEN v_role IN ('student', 'both', 'student_parent') THEN p_section_id ELSE NULL END,
      grade_id = CASE WHEN v_role IN ('student', 'both', 'student_parent') THEN p_grade_id ELSE NULL END,
      course_id = CASE WHEN v_role IN ('student', 'both', 'student_parent') THEN p_course_id ELSE NULL END,
      grade = CASE WHEN v_role IN ('student', 'both', 'student_parent') THEN v_academic_label ELSE NULL END,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manage_user_with_academics(uuid,text,text,text,text,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_user_with_academics(uuid,text,text,text,text,text,text,text,uuid,uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_with_academics(uuid,text,text,text,text,text,text,text,uuid,uuid,uuid) TO authenticated;
