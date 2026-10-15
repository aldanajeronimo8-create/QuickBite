-- Keep expired recesses visible as disabled choices so students understand that ordering is closed.
CREATE OR REPLACE FUNCTION public.get_student_preorder_options()
RETURNS TABLE(
  recess_schedule_id uuid,
  name text,
  start_time time without time zone,
  end_time time without time zone,
  pickup_date date,
  preorders_count bigint,
  max_preorders integer,
  is_active boolean,
  can_order boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_student public.profiles%rowtype;
  v_now timestamp := now() AT TIME ZONE 'America/Bogota';
  v_time time := (now() AT TIME ZONE 'America/Bogota')::time;
  v_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := extract(dow FROM (now() AT TIME ZONE 'America/Bogota'));
  v_limit integer := 2;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = public.effective_student_user_id()
    AND role IN ('student', 'both');
  IF NOT FOUND THEN RAISE EXCEPTION 'student_only'; END IF;
  -- Profiles without an academic section have no recess options; legacy pickup windows remain available.
  IF v_student.section_id IS NULL THEN RETURN; END IF;

  SELECT max_preorders_per_student INTO v_limit
  FROM public.recess_order_settings WHERE id = true;
  v_limit := coalesce(v_limit, 2);

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.start_time,
         s.end_time,
         v_date,
         coalesce(counts.preorders_count, 0)::bigint,
         v_limit,
         (v_time >= s.start_time AND v_time < s.end_time),
         (
           (v_time >= s.start_time AND v_time < s.end_time)
           OR
           (v_time < s.start_time AND coalesce(counts.preorders_count, 0) < v_limit)
         )
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS preorders_count
    FROM public.orders o
    WHERE o.user_id = v_student.id
      AND o.scheduled_recess_schedule_id = s.id
      AND o.preordered IS TRUE
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status <> 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
  ) counts ON true
  WHERE s.active AND s.weekday = v_dow
    AND t.section_id = v_student.section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
    -- Include expired breaks as disabled options so checkout explains why ordering is closed.
  ORDER BY s.start_time;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_student_preorder_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_preorder_options() TO authenticated;
