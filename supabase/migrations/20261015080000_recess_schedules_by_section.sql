-- Make every recess schedule section-based, normalize legacy targets, and use the active section period to authorize orders.
-- Existing grade/course-targeted schedules are preserved but normalized to their parent section.
WITH mapped_targets AS (
  SELECT
    t.id,
    CASE
      WHEN t.course_id IS NOT NULL THEN course_grade.section_id
      WHEN t.grade_id IS NOT NULL THEN grade_target.section_id
      ELSE t.section_id
    END AS resolved_section_id
  FROM public.recess_schedule_targets t
  LEFT JOIN public.academic_courses c ON c.id = t.course_id
  LEFT JOIN public.academic_grades course_grade ON course_grade.id = c.grade_id
  LEFT JOIN public.academic_grades grade_target ON grade_target.id = t.grade_id
  WHERE t.course_id IS NOT NULL OR t.grade_id IS NOT NULL
)
UPDATE public.recess_schedule_targets t
SET section_id = m.resolved_section_id,
    grade_id = NULL,
    course_id = NULL
FROM mapped_targets m
WHERE m.id = t.id AND m.resolved_section_id IS NOT NULL;

-- A schedule that previously targeted multiple grades/courses inside one section
-- only needs one section target after normalization.
DELETE FROM public.recess_schedule_targets duplicate_target
USING public.recess_schedule_targets retained_target
WHERE duplicate_target.recess_schedule_id = retained_target.recess_schedule_id
  AND duplicate_target.section_id = retained_target.section_id
  AND duplicate_target.grade_id IS NULL
  AND duplicate_target.course_id IS NULL
  AND retained_target.grade_id IS NULL
  AND retained_target.course_id IS NULL
  AND duplicate_target.id > retained_target.id;

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
  IF p_scope IS DISTINCT FROM 'section' OR p_grade_id IS NOT NULL OR p_course_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_recess_target';
  END IF;
  IF p_section_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academic_sections WHERE id = p_section_id AND active
  ) THEN
    RAISE EXCEPTION 'invalid_recess_section';
  END IF;

  INSERT INTO public.recess_schedules(name, weekday, start_time, end_time, active, priority)
  VALUES(v_name, p_weekday::smallint, p_start_time, p_end_time, true, 0)
  RETURNING id INTO v_schedule_id;

  INSERT INTO public.recess_schedule_targets(recess_schedule_id, section_id, grade_id, course_id)
  VALUES(v_schedule_id, p_section_id, NULL, NULL);

  INSERT INTO public.audit_logs(action, actor_id, actor_email, entity, entity_id, metadata)
  SELECT 'recess_schedule.created', auth.uid(), au.email, 'recess_schedule', v_schedule_id::text,
         jsonb_build_object('scope', 'section', 'weekday', p_weekday)
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

CREATE OR REPLACE FUNCTION public.get_student_recess_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_student public.profiles%rowtype;
  v_student_id uuid := public.effective_student_user_id();
  v_now timestamp := now() AT TIME ZONE 'America/Bogota';
  v_dow int := extract(dow FROM v_now);
  v_minutes int := extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int;
  v_active jsonb;
  v_next jsonb;
BEGIN
  SELECT * INTO v_student FROM public.profiles WHERE id = v_student_id;
  IF NOT FOUND OR v_student.role NOT IN ('student', 'both') THEN
    RAISE EXCEPTION 'student_only';
  END IF;

  SELECT jsonb_build_object(
    'id', q.id,
    'name', q.name,
    'start_time', q.start_time,
    'end_time', q.end_time,
    'minutes_remaining', greatest(0,
      (extract(hour FROM q.end_time)::int * 60 + extract(minute FROM q.end_time)::int) - v_minutes),
    'scope_level', 1
  )
  INTO v_active
  FROM (
    SELECT s.id, s.name, s.start_time, s.end_time
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.active AND s.weekday = v_dow
      AND t.section_id = v_student.section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
      AND (extract(hour FROM s.start_time)::int * 60 + extract(minute FROM s.start_time)::int) <= v_minutes
      AND (extract(hour FROM s.end_time)::int * 60 + extract(minute FROM s.end_time)::int) > v_minutes
  ) q
  ORDER BY q.start_time
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', q.id,
    'name', q.name,
    'start_time', q.start_time,
    'end_time', q.end_time,
    'starts_in_minutes', q.starts_in_minutes,
    'scope_level', 1
  )
  INTO v_next
  FROM (
    SELECT s.id, s.name, s.start_time, s.end_time,
      (extract(hour FROM s.start_time)::int * 60 + extract(minute FROM s.start_time)::int) - v_minutes AS starts_in_minutes
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.active AND s.weekday = v_dow
      AND t.section_id = v_student.section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
      AND (extract(hour FROM s.start_time)::int * 60 + extract(minute FROM s.start_time)::int) > v_minutes
  ) q
  ORDER BY q.start_time
  LIMIT 1;

  RETURN jsonb_build_object(
    'date', v_now::date,
    'timezone', 'America/Bogota',
    'is_active', v_active IS NOT NULL,
    'active', coalesce(v_active, 'null'::jsonb),
    'next', coalesce(v_next, 'null'::jsonb),
    'student_section_id', v_student.section_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_recess_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_recess_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order_tx(p_user_id uuid, p_payment_method text, p_payment_status text, p_status text, p_pickup_code text, p_estimated_minutes integer, p_payment_reference text, p_items jsonb, p_notes text, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'QB' || to_char(now(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_pickup_code text := upper(encode(gen_random_bytes(6), 'hex'));
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_existing_order_number text;
  v_existing_user_id uuid;
  v_slot public.pickup_slots;
  v_orders_count bigint;
  v_local_time time := (current_timestamp AT TIME ZONE 'America/Bogota')::time;
  v_local_date date := (current_timestamp AT TIME ZONE 'America/Bogota')::date;
  v_windows_enabled boolean := coalesce(public.get_order_windows_enabled(), true);
  v_dow integer := extract(dow FROM (current_timestamp AT TIME ZONE 'America/Bogota'));
  v_recess_configured boolean := false;
  v_recess_active boolean := false;
  v_initial_status text := 'pending';
  v_initial_payment_status text := 'pending';
  v_product_ingredients text := '';
BEGIN
  PERFORM set_config('quickbite.internal_order_tx', '1', true);

  IF auth.uid() IS NULL OR (p_user_id <> public.effective_student_user_id() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'order_request_id_required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'order_items_required'; END IF;
  IF p_payment_method NOT IN ('nequi', 'cash', 'bre-b', 'credits') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_user'; END IF;

  SELECT order_number, user_id
    INTO v_existing_order_number, v_existing_user_id
  FROM public.orders WHERE client_request_id = p_request_id;

  IF v_existing_order_number IS NOT NULL THEN
    IF v_existing_user_id <> p_user_id THEN RAISE EXCEPTION 'order_request_id_conflict'; END IF;
    RETURN v_existing_order_number;
  END IF;

  IF NOT public.is_admin() THEN
    SELECT EXISTS (
      SELECT 1 FROM public.recess_schedules WHERE active AND weekday = v_dow
    ) INTO v_recess_configured;

    IF v_recess_configured THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.recess_schedule_targets t
          ON (t.section_id = p.section_id AND t.grade_id IS NULL AND t.course_id IS NULL)
        JOIN public.recess_schedules s ON s.id = t.recess_schedule_id
        WHERE p.id = p_user_id AND s.active AND s.weekday = v_dow
          AND v_local_time >= s.start_time AND v_local_time < s.end_time
      ) INTO v_recess_active;
      IF NOT v_recess_active THEN RAISE EXCEPTION 'no_active_recess_window'; END IF;
    END IF;
  END IF;

  IF v_windows_enabled AND NOT v_recess_configured THEN
    SELECT s.* INTO v_slot
    FROM public.pickup_slots s
    WHERE s.enabled AND v_local_time >= s.starts_at AND v_local_time < s.ends_at
    ORDER BY s.starts_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no_active_pickup_window'; END IF;

    SELECT count(*) INTO v_orders_count
    FROM public.orders o
    WHERE o.pickup_slot_id = v_slot.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date = v_local_date;
    IF v_slot.max_orders IS NOT NULL AND v_orders_count >= v_slot.max_orders THEN
      RAISE EXCEPTION 'pickup_window_full';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.orders(
      id, user_id, total, status, payment_method, payment_status, order_number,
      pickup_code, estimated_minutes, payment_reference, notes, student_comment,
      client_request_id, pickup_slot_id
    )
    VALUES (
      v_order_id, p_user_id, 0, v_initial_status, p_payment_method,
      v_initial_payment_status, v_order_number, v_pickup_code,
      p_estimated_minutes, p_payment_reference, NULLIF(trim(p_notes), ''),
      NULLIF(trim(p_notes), ''), p_request_id,
      CASE WHEN v_windows_enabled AND NOT v_recess_configured THEN v_slot.id ELSE NULL END
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT order_number, user_id INTO v_existing_order_number, v_existing_user_id
    FROM public.orders WHERE client_request_id = p_request_id;
    IF v_existing_order_number IS NOT NULL AND v_existing_user_id = p_user_id THEN
      RETURN v_existing_order_number;
    END IF;
    RAISE;
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_product.available IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.parent_food_blocks b
      WHERE b.student_user_id = p_user_id AND b.product_id = v_product.id
    ) THEN
      RAISE EXCEPTION 'product_blocked_by_parent';
    END IF;

    SELECT coalesce(n.ingredients, '')
      INTO v_product_ingredients
    FROM public.product_nutrition n
    WHERE n.product_id = v_product.id;
    v_product_ingredients := coalesce(v_product_ingredients, '');

    IF EXISTS (
      SELECT 1
      FROM public.student_ingredient_blocks b
      CROSS JOIN LATERAL regexp_split_to_table(
        v_product_ingredients, E'[,;\\n\\r]+'
      ) AS ingredient(value)
      WHERE b.student_user_id = p_user_id
        AND position(
          ' ' || b.ingredient_key || ' '
          IN ' ' || trim(regexp_replace(lower(ingredient.value), '[^[:alnum:]]+', ' ', 'g')) || ' '
        ) > 0
    ) THEN
      RAISE EXCEPTION 'blocked_ingredient_in_product';
    END IF;

    IF v_product.stock < v_quantity THEN RAISE EXCEPTION 'insufficient_stock'; END IF;

    UPDATE public.products SET stock = stock - v_quantity, updated_at = now()
    WHERE id = v_product.id;

    INSERT INTO public.order_items(order_id, product_id, quantity, price)
    VALUES (v_order_id, v_product.id, v_quantity, v_product.price);

    v_total := v_total + (v_product.price * v_quantity);
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;

  IF p_payment_method = 'credits' THEN
    PERFORM public.apply_wallet_transaction(
      p_user_id, -v_total, 'purchase', 'Compra QuickBite con créditos', v_order_id::text, v_order_id
    );
    UPDATE public.orders
    SET payment_status = 'confirmed', payment_reference = 'PAGO-CON-CREDITOS'
    WHERE id = v_order_id;
  END IF;

  RETURN v_order_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) TO authenticated;
