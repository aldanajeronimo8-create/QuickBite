-- Atomically create a recess schedule and its academic target.
-- A missing or invalid target aborts the transaction, so no orphan schedule is left behind.
CREATE OR REPLACE FUNCTION public.admin_create_recess_schedule_with_target(
  p_name text,
  p_weekday integer,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_scope text,
  p_section_id uuid,
  p_grade_id uuid,
  p_course_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_schedule_id uuid;
  v_name text := trim(COALESCE(p_name, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_recess_name';
  END IF;
  IF p_weekday IS NULL OR p_weekday < 0 OR p_weekday > 6 THEN
    RAISE EXCEPTION 'invalid_recess_weekday';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'invalid_recess_time_range';
  END IF;
  IF p_scope NOT IN ('section', 'grade', 'course') THEN
    RAISE EXCEPTION 'invalid_recess_scope';
  END IF;
  IF p_section_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academic_sections WHERE id = p_section_id AND active
  ) THEN
    RAISE EXCEPTION 'invalid_recess_section';
  END IF;

  IF p_scope = 'section' THEN
    IF p_grade_id IS NOT NULL OR p_course_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_recess_target';
    END IF;
  ELSIF p_scope = 'grade' THEN
    IF p_grade_id IS NULL OR p_course_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.academic_grades
      WHERE id = p_grade_id AND section_id = p_section_id AND active
    ) THEN
      RAISE EXCEPTION 'invalid_recess_grade';
    END IF;
  ELSE
    IF p_grade_id IS NULL OR p_course_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.academic_courses c
      JOIN public.academic_grades g ON g.id = c.grade_id
      WHERE c.id = p_course_id AND c.grade_id = p_grade_id
        AND g.section_id = p_section_id AND c.active AND g.active
    ) THEN
      RAISE EXCEPTION 'invalid_recess_course';
    END IF;
  END IF;

  INSERT INTO public.recess_schedules(name, weekday, start_time, end_time, active, priority)
  VALUES(v_name, p_weekday::smallint, p_start_time, p_end_time, true, 0)
  RETURNING id INTO v_schedule_id;

  INSERT INTO public.recess_schedule_targets(recess_schedule_id, section_id, grade_id, course_id)
  VALUES(
    v_schedule_id,
    CASE WHEN p_scope = 'section' THEN p_section_id ELSE NULL END,
    CASE WHEN p_scope = 'grade' THEN p_grade_id ELSE NULL END,
    CASE WHEN p_scope = 'course' THEN p_course_id ELSE NULL END
  );

  INSERT INTO public.audit_logs(action, actor_id, actor_email, entity, entity_id, metadata)
  SELECT 'recess_schedule.created', auth.uid(), au.email, 'recess_schedule', v_schedule_id::text,
         jsonb_build_object('scope', p_scope, 'weekday', p_weekday)
  FROM auth.users au WHERE au.id = auth.uid();

  RETURN v_schedule_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_recess_schedule_with_target(
  text, integer, time without time zone, time without time zone, text, uuid, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_recess_schedule_with_target(
  text, integer, time without time zone, time without time zone, text, uuid, uuid, uuid
) TO authenticated;
