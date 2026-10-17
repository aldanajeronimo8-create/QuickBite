-- Allow a student to rebook an unclaimed recess order into a future active recess.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_reschedule_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_pickup_reschedule_count_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_reschedule_count_check CHECK (pickup_reschedule_count >= 0);

CREATE OR REPLACE FUNCTION public.get_student_repickup_options(p_order_id uuid)
RETURNS TABLE (
  recess_schedule_id uuid,
  recess_name text,
  pickup_date date,
  start_time time,
  end_time time,
  students_count bigint,
  max_students integer,
  can_select boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid := public.effective_student_user_id();
  v_order public.orders%rowtype;
  v_section_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_now timestamp := now() AT TIME ZONE 'America/Bogota';
BEGIN
  IF auth.uid() IS NULL OR v_user_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_order FROM public.orders o
  WHERE o.id = p_order_id AND o.user_id = v_user_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.pickup_outcome <> 'unclaimed'
     OR v_order.payment_status <> 'confirmed'
     OR v_order.status IN ('delivered', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'order_not_eligible_for_reschedule';
  END IF;

  SELECT p.section_id INTO v_section_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.role IN ('student','both');
  IF v_section_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id, s.name, d.pickup_date, s.start_time, s.end_time,
         coalesce(c.students_count, 0)::bigint, s.max_students,
         (s.max_students IS NULL OR coalesce(c.students_count,0) < s.max_students
           OR coalesce(c.student_has_order,false))
  FROM generate_series(0, 7) AS offset_day(n)
  CROSS JOIN LATERAL (
    SELECT (v_today + offset_day.n::integer)::date AS pickup_date
  ) d
  JOIN public.recess_schedules s ON s.active
    AND s.weekday = extract(dow FROM d.pickup_date)::integer
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    AND t.section_id = v_section_id AND t.grade_id IS NULL AND t.course_id IS NULL
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT o.user_id)::bigint AS students_count,
           coalesce(bool_or(o.user_id = v_user_id), false) AS student_has_order
    FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = s.id
      AND o.status NOT IN ('cancelled','rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = d.pickup_date
      AND o.pickup_outcome <> 'unclaimed'
  ) c ON true
  WHERE d.pickup_date > v_today
     OR (d.pickup_date = v_today AND s.start_time > v_now::time)
  ORDER BY d.pickup_date, s.start_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_repickup_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_repickup_options(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_unclaimed_recess_order(
  p_order_id uuid,
  p_recess_schedule_id uuid,
  p_pickup_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid := public.effective_student_user_id();
  v_order public.orders%rowtype;
  v_student public.profiles%rowtype;
  v_schedule public.recess_schedules%rowtype;
  v_today date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_now timestamp := now() AT TIME ZONE 'America/Bogota';
  v_count bigint;
  v_has_order boolean;
BEGIN
  IF auth.uid() IS NULL OR v_user_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.pickup_outcome <> 'unclaimed'
     OR v_order.payment_status <> 'confirmed'
     OR v_order.status IN ('delivered','rejected','cancelled') THEN
    RAISE EXCEPTION 'order_not_eligible_for_reschedule';
  END IF;
  IF p_pickup_date IS NULL OR p_pickup_date < v_today OR p_pickup_date > v_today + 7 THEN
    RAISE EXCEPTION 'invalid_pickup_date';
  END IF;

  SELECT * INTO v_student FROM public.profiles
    WHERE id = v_user_id AND role IN ('student','both');
  IF NOT FOUND OR v_student.section_id IS NULL THEN RAISE EXCEPTION 'student_section_required'; END IF;

  SELECT s.* INTO v_schedule
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  WHERE s.id = p_recess_schedule_id AND s.active
    AND s.weekday = extract(dow FROM p_pickup_date)::integer
    AND t.section_id = v_student.section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_recess_schedule_for_student'; END IF;
  IF p_pickup_date = v_today AND v_schedule.start_time <= v_now::time THEN
    RAISE EXCEPTION 'recess_pickup_time_passed';
  END IF;

  SELECT count(DISTINCT o.user_id), coalesce(bool_or(o.user_id = v_user_id),false)
    INTO v_count, v_has_order
  FROM public.orders o
  WHERE o.scheduled_recess_schedule_id = v_schedule.id
    AND o.status NOT IN ('cancelled','rejected')
    AND o.payment_status IS DISTINCT FROM 'rejected'
    AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = p_pickup_date
    AND o.pickup_outcome <> 'unclaimed'
    AND o.id <> v_order.id;
  IF v_schedule.max_students IS NOT NULL AND NOT v_has_order AND v_count >= v_schedule.max_students THEN
    RAISE EXCEPTION 'recess_student_limit_reached';
  END IF;

  PERFORM set_config('quickbite.internal_order_tx','1',true);
  UPDATE public.orders
  SET scheduled_recess_schedule_id = v_schedule.id,
      scheduled_recess_name = v_schedule.name,
      scheduled_for = (p_pickup_date + v_schedule.start_time) AT TIME ZONE 'America/Bogota',
      scheduled_pickup_until = (p_pickup_date + v_schedule.end_time) AT TIME ZONE 'America/Bogota',
      preordered = true,
      pickup_outcome = 'awaiting',
      pickup_reschedule_count = pickup_reschedule_count + 1,
      updated_at = now()
  WHERE id = v_order.id;

  PERFORM public.write_system_audit_event(
    'order.unclaimed_pickup_rescheduled','orders',v_order.id::text,
    jsonb_build_object('order_number',v_order.order_number,
      'old_scheduled_for',v_order.scheduled_for,
      'new_scheduled_for',(p_pickup_date + v_schedule.start_time) AT TIME ZONE 'America/Bogota',
      'schedule_id',v_schedule.id)
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reschedule_unclaimed_recess_order(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_unclaimed_recess_order(uuid, uuid, date) TO authenticated;
