-- Replace the per-student preorder count with a per-recess student capacity.
-- Also provide guarded admin RPCs for editing and deleting weekly schedules.
ALTER TABLE public.recess_schedules
  ADD COLUMN IF NOT EXISTS max_students integer;

ALTER TABLE public.recess_schedules
  DROP CONSTRAINT IF EXISTS recess_schedules_max_students_check;
ALTER TABLE public.recess_schedules
  ADD CONSTRAINT recess_schedules_max_students_check
  CHECK (max_students IS NULL OR max_students >= 1);

COMMENT ON COLUMN public.recess_schedules.max_students IS
  'Maximum number of distinct students with an active order for this recess and day; NULL means unlimited.';

CREATE OR REPLACE FUNCTION public.admin_save_weekly_recess_schedule(
  p_name text,
  p_weekdays integer[],
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_section_id uuid,
  p_max_students integer,
  p_existing_schedule_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_day integer;
  v_schedule_id uuid;
  v_saved_ids uuid[] := ARRAY[]::uuid[];
  v_existing_ids uuid[] := coalesce(p_existing_schedule_ids, ARRAY[]::uuid[]);
  v_found boolean;
  v_matched_count integer;
  v_group_variants integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_name NOT IN ('Primer Descanso', 'Segundo Descanso') THEN
    RAISE EXCEPTION 'invalid_recess_name';
  END IF;
  IF p_weekdays IS NULL OR cardinality(p_weekdays) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_weekdays) AS d(day) WHERE d.day < 0 OR d.day > 6)
     OR cardinality(p_weekdays) <> (SELECT count(DISTINCT d.day) FROM unnest(p_weekdays) AS d(day)) THEN
    RAISE EXCEPTION 'invalid_recess_weekdays';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'invalid_recess_time_range';
  END IF;
  IF p_max_students IS NOT NULL AND p_max_students < 1 THEN
    RAISE EXCEPTION 'invalid_recess_student_limit';
  END IF;
  IF p_section_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academic_sections WHERE id = p_section_id AND active
  ) THEN
    RAISE EXCEPTION 'invalid_recess_section';
  END IF;

  IF cardinality(v_existing_ids) > 0 THEN
    SELECT count(DISTINCT s.id),
           count(DISTINCT (s.name, s.start_time, s.end_time, s.active, s.max_students))
    INTO v_matched_count, v_group_variants
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.id = ANY(v_existing_ids)
      AND t.section_id = p_section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL;

    IF v_matched_count <> cardinality(v_existing_ids) OR v_group_variants <> 1 THEN
      RAISE EXCEPTION 'invalid_recess_schedule_group';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_weekdays) AS d(day)
    JOIN public.recess_schedules other_schedule
      ON other_schedule.weekday = d.day
     AND other_schedule.active
     AND other_schedule.start_time < p_end_time
     AND other_schedule.end_time > p_start_time
    JOIN public.recess_schedule_targets target
      ON target.recess_schedule_id = other_schedule.id
     AND target.section_id = p_section_id
     AND target.grade_id IS NULL
     AND target.course_id IS NULL
    WHERE NOT (other_schedule.id = ANY(v_existing_ids))
  ) THEN
    RAISE EXCEPTION 'overlapping_recess_schedule';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_weekdays) AS d(day)
    JOIN public.recess_schedules other_schedule
      ON other_schedule.weekday = d.day
     AND other_schedule.active
     AND other_schedule.name = p_name
    JOIN public.recess_schedule_targets target
      ON target.recess_schedule_id = other_schedule.id
     AND target.section_id = p_section_id
     AND target.grade_id IS NULL
     AND target.course_id IS NULL
    WHERE NOT (other_schedule.id = ANY(v_existing_ids))
  ) THEN
    RAISE EXCEPTION 'recess_schedule_already_exists';
  END IF;

  FOR v_day IN 0..6 LOOP
    v_schedule_id := NULL;
    SELECT s.id INTO v_schedule_id
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.weekday = v_day
      AND s.id = ANY(v_existing_ids)
      AND t.section_id = p_section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
    ORDER BY s.created_at DESC
    LIMIT 1
    FOR UPDATE OF s;

    v_found := FOUND;
    IF v_day = ANY(p_weekdays) THEN
      IF v_found THEN
        UPDATE public.recess_schedules
        SET name = p_name,
            start_time = p_start_time,
            end_time = p_end_time,
            max_students = p_max_students,
            active = true,
            updated_at = now()
        WHERE id = v_schedule_id;
      ELSE
        INSERT INTO public.recess_schedules(name, weekday, start_time, end_time, active, priority, max_students)
        VALUES (p_name, v_day::smallint, p_start_time, p_end_time, true, 0, p_max_students)
        RETURNING id INTO v_schedule_id;

        INSERT INTO public.recess_schedule_targets(recess_schedule_id, section_id, grade_id, course_id)
        VALUES (v_schedule_id, p_section_id, NULL, NULL);
      END IF;
      v_saved_ids := array_append(v_saved_ids, v_schedule_id);
    ELSIF v_found THEN
      -- Keep old order references/history intact; deselected weekdays are deactivated.
      UPDATE public.recess_schedules
      SET active = false, updated_at = now()
      WHERE id = v_schedule_id;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs(action, actor_id, entity, entity_id, metadata)
  VALUES (
    CASE WHEN cardinality(v_existing_ids) > 0 THEN 'recess_schedule.updated' ELSE 'recess_schedule.created' END,
    auth.uid(),
    'recess_schedule',
    p_section_id::text,
    jsonb_build_object(
      'name', p_name,
      'weekdays', p_weekdays,
      'start_time', p_start_time::text,
      'end_time', p_end_time::text,
      'max_students', p_max_students,
      'schedule_ids', to_jsonb(v_saved_ids)
    )
  );

  RETURN v_saved_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_weekly_recess_schedule(text, integer[], time without time zone, time without time zone, uuid, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_weekly_recess_schedule(text, integer[], time without time zone, time without time zone, uuid, integer, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_recess_schedule_group(p_schedule_ids uuid[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_ids uuid[] := coalesce(p_schedule_ids, ARRAY[]::uuid[]);
  v_matched_count integer;
  v_group_variants integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF cardinality(v_ids) = 0
     OR cardinality(v_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_ids) AS supplied(id)) THEN
    RAISE EXCEPTION 'invalid_recess_schedule_group';
  END IF;

  SELECT count(DISTINCT s.id),
         count(DISTINCT (t.section_id, s.name, s.start_time, s.end_time, s.active, s.max_students))
  INTO v_matched_count, v_group_variants
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  WHERE s.id = ANY(v_ids)
    AND t.section_id IS NOT NULL
    AND t.grade_id IS NULL AND t.course_id IS NULL;

  IF v_matched_count <> cardinality(v_ids) OR v_group_variants <> 1 THEN
    RAISE EXCEPTION 'invalid_recess_schedule_group';
  END IF;

  -- Retain schedules referenced by any order so historic receipts remain valid.
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = ANY(v_ids)
  ) THEN
    UPDATE public.recess_schedules
    SET active = false, updated_at = now()
    WHERE id = ANY(v_ids);

    INSERT INTO public.audit_logs(action, actor_id, entity, entity_id, metadata)
    VALUES ('recess_schedule.archived', auth.uid(), 'recess_schedule',
            array_to_string(v_ids, ','),
            jsonb_build_object('schedule_ids', to_jsonb(v_ids), 'reason', 'orders_exist'));
    RETURN 'archived';
  END IF;

  DELETE FROM public.recess_schedule_targets WHERE recess_schedule_id = ANY(v_ids);
  DELETE FROM public.recess_schedules WHERE id = ANY(v_ids);

  INSERT INTO public.audit_logs(action, actor_id, entity, entity_id, metadata)
  VALUES ('recess_schedule.deleted', auth.uid(), 'recess_schedule',
          array_to_string(v_ids, ','),
          jsonb_build_object('schedule_ids', to_jsonb(v_ids)));

  RETURN 'deleted';
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_recess_schedule_group(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_recess_schedule_group(uuid[]) TO authenticated;


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
  v_time time := (now() AT TIME ZONE 'America/Bogota')::time;
  v_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := extract(dow FROM (now() AT TIME ZONE 'America/Bogota'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = public.effective_student_user_id()
    AND role IN ('student', 'both');

  IF NOT FOUND THEN RAISE EXCEPTION 'student_only'; END IF;
  IF v_student.section_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.start_time,
         s.end_time,
         v_date,
         coalesce(counts.students_count, 0)::bigint,
         s.max_students,
         (v_time >= s.start_time AND v_time < s.end_time),
         (
           v_time < s.end_time
           AND (
             s.max_students IS NULL
             OR coalesce(counts.students_count, 0) < s.max_students
             OR coalesce(counts.student_has_order, false)
           )
         )
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT o.user_id)::bigint AS students_count,
           coalesce(bool_or(o.user_id = v_student.id), false) AS student_has_order
    FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = s.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
  ) counts ON true
  WHERE s.active AND s.weekday = v_dow
    AND t.section_id = v_student.section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
  ORDER BY s.start_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_preorder_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_preorder_options() TO authenticated;


CREATE OR REPLACE FUNCTION public.create_order_with_recess_tx(p_user_id uuid, p_payment_method text, p_payment_status text, p_status text, p_pickup_code text, p_estimated_minutes integer, p_payment_reference text, p_items jsonb, p_notes text, p_request_id uuid, p_recess_schedule_id uuid, p_pickup_date date)
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
  v_recess public.recess_schedules%rowtype;
  v_selected_recess_schedule_id uuid := NULL;
  v_scheduled_for timestamptz := NULL;
  v_scheduled_pickup_until timestamptz := NULL;
  v_scheduled_recess_name text := NULL;
  v_is_preorder boolean := false;
  v_student_section_id uuid := NULL;
  v_max_students integer;
  v_students_count bigint := 0;
  v_student_has_existing_order boolean := false;
  v_capacity_date date;
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
    SELECT p.section_id INTO v_student_section_id
    FROM public.profiles p
    WHERE p.id = p_user_id AND p.role IN ('student', 'both');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'student_only';
    END IF;
    -- A student without an assigned section keeps the legacy pickup-window flow.
    -- Do not force an unrelated section's recess schedule onto this profile.

    SELECT EXISTS (
      SELECT 1
      FROM public.recess_schedules s
      JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
      WHERE s.active AND s.weekday = v_dow
        AND t.section_id = v_student_section_id
        AND t.grade_id IS NULL AND t.course_id IS NULL
    ) INTO v_recess_configured;
  END IF;

  IF p_recess_schedule_id IS NOT NULL OR p_pickup_date IS NOT NULL THEN
    IF p_recess_schedule_id IS NULL OR p_pickup_date IS NULL THEN
      RAISE EXCEPTION 'invalid_recess_preorder_request';
    END IF;
    IF p_pickup_date <> v_local_date THEN
      RAISE EXCEPTION 'preorder_must_be_same_day';
    END IF;

    IF public.is_admin() THEN
      SELECT s.* INTO v_recess
      FROM public.recess_schedules s
      WHERE s.id = p_recess_schedule_id AND s.active AND s.weekday = v_dow
      FOR UPDATE OF s;
    ELSE
      SELECT s.* INTO v_recess
      FROM public.recess_schedules s
      JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
      WHERE s.id = p_recess_schedule_id AND s.active AND s.weekday = v_dow
        AND t.section_id = v_student_section_id
        AND t.grade_id IS NULL AND t.course_id IS NULL
      FOR UPDATE OF s;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_recess_schedule_for_student';
    END IF;
    IF v_local_time >= v_recess.end_time THEN
      RAISE EXCEPTION 'recess_window_closed';
    END IF;

    v_recess_configured := true;
    v_selected_recess_schedule_id := v_recess.id;
    v_scheduled_recess_name := v_recess.name;
    v_scheduled_for := (p_pickup_date + v_recess.start_time) AT TIME ZONE 'America/Bogota';
    v_scheduled_pickup_until := (p_pickup_date + v_recess.end_time) AT TIME ZONE 'America/Bogota';
    v_is_preorder := v_local_time < v_recess.start_time;


  ELSIF NOT public.is_admin() AND v_recess_configured THEN
    SELECT s.* INTO v_recess
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.active AND s.weekday = v_dow
      AND t.section_id = v_student_section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
      AND v_local_time >= s.start_time AND v_local_time < s.end_time
    ORDER BY s.start_time
    LIMIT 1
    FOR UPDATE OF s;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_active_recess_window';
    END IF;

    v_recess_active := true;
    v_selected_recess_schedule_id := v_recess.id;
    v_scheduled_recess_name := v_recess.name;
    v_scheduled_for := (v_local_date + v_recess.start_time) AT TIME ZONE 'America/Bogota';
    v_scheduled_pickup_until := (v_local_date + v_recess.end_time) AT TIME ZONE 'America/Bogota';
    v_is_preorder := false;
  END IF;

  -- Capacity counts distinct students with a live order for this exact recess and day.
  -- Locking the schedule row above serializes concurrent checkouts for the same capacity.
  IF NOT public.is_admin() AND v_selected_recess_schedule_id IS NOT NULL THEN
    v_capacity_date := coalesce(p_pickup_date, v_local_date);
    v_max_students := v_recess.max_students;

    IF v_max_students IS NOT NULL THEN
      SELECT count(DISTINCT o.user_id),
             coalesce(bool_or(o.user_id = p_user_id), false)
      INTO v_students_count, v_student_has_existing_order
      FROM public.orders o
      WHERE o.scheduled_recess_schedule_id = v_selected_recess_schedule_id
        AND o.status NOT IN ('cancelled', 'rejected')
        AND o.payment_status IS DISTINCT FROM 'rejected'
        AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_capacity_date;

      -- The cap is about how many students can order, not how many orders one
      -- student can make; an already-counted student does not consume a new slot.
      IF NOT v_student_has_existing_order AND v_students_count >= v_max_students THEN
        RAISE EXCEPTION 'recess_student_limit_reached';
      END IF;
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
      client_request_id, pickup_slot_id, scheduled_recess_schedule_id,
      scheduled_recess_name, scheduled_for, scheduled_pickup_until, preordered, pickup_outcome
    )
    VALUES (
      v_order_id, p_user_id, 0, v_initial_status, p_payment_method,
      v_initial_payment_status, v_order_number, v_pickup_code,
      p_estimated_minutes, p_payment_reference, NULLIF(trim(p_notes), ''),
      NULLIF(trim(p_notes), ''), p_request_id,
      CASE WHEN v_windows_enabled AND NOT v_recess_configured THEN v_slot.id ELSE NULL END,
      v_selected_recess_schedule_id, v_scheduled_recess_name, v_scheduled_for,
      v_scheduled_pickup_until, v_is_preorder, 'awaiting'
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
