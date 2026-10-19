-- Close advance reservations at recess start and offer released places to waitlisted students.
BEGIN;

CREATE TABLE IF NOT EXISTS public.recess_order_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recess_schedule_id uuid NOT NULL REFERENCES public.recess_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pickup_date date NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recess_order_waitlist_active_student
  ON public.recess_order_waitlist(recess_schedule_id, user_id, pickup_date)
  WHERE status IN ('waiting', 'offered');
CREATE INDEX IF NOT EXISTS idx_recess_order_waitlist_queue
  ON public.recess_order_waitlist(recess_schedule_id, pickup_date, status, created_at, id);

ALTER TABLE public.recess_order_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recess_order_waitlist FROM PUBLIC, anon, authenticated;

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
    SELECT count(DISTINCT occupied.user_id)::bigint AS students_count,
           coalesce(bool_or(occupied.user_id = v_student.id), false) AS student_has_order
    FROM (
      SELECT o.user_id
      FROM public.orders o
      WHERE o.scheduled_recess_schedule_id = s.id
        AND o.status NOT IN ('cancelled', 'rejected')
        AND o.payment_status IS DISTINCT FROM 'rejected'
        AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
      UNION
      SELECT w.user_id
      FROM public.recess_order_waitlist w
      WHERE w.recess_schedule_id = s.id
        AND w.pickup_date = v_date
        AND w.status = 'offered'
        AND w.offer_expires_at > now()
    ) occupied
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

  -- Capacity counts distinct students with active orders and unexpired waitlist offers.
  -- The schedule row lock serializes concurrent checkouts and waitlist offers.
  IF NOT public.is_admin() AND v_selected_recess_schedule_id IS NOT NULL THEN
    v_capacity_date := coalesce(p_pickup_date, v_local_date);
    v_max_students := v_recess.max_students;

    IF v_max_students IS NOT NULL THEN
      SELECT count(DISTINCT occupied.user_id),
             coalesce(bool_or(occupied.user_id = p_user_id), false)
      INTO v_students_count, v_student_has_existing_order
      FROM (
        SELECT o.user_id
        FROM public.orders o
        WHERE o.scheduled_recess_schedule_id = v_selected_recess_schedule_id
          AND o.status NOT IN ('cancelled', 'rejected')
          AND o.payment_status IS DISTINCT FROM 'rejected'
          AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_capacity_date
        UNION
        SELECT w.user_id
        FROM public.recess_order_waitlist w
        WHERE w.recess_schedule_id = v_selected_recess_schedule_id
          AND w.pickup_date = v_capacity_date
          AND w.status = 'offered'
          AND w.offer_expires_at > now()
      ) occupied;

      -- Existing orders and active offers reserve one place per distinct student.
      IF NOT v_student_has_existing_order AND v_students_count >= v_max_students THEN
        RAISE EXCEPTION 'recess_student_limit_reached';
      END IF;

      -- Accept an offered place atomically with this checkout.
      UPDATE public.recess_order_waitlist
      SET status = 'accepted', updated_at = now()
      WHERE recess_schedule_id = v_selected_recess_schedule_id
        AND pickup_date = v_capacity_date
        AND user_id = p_user_id
        AND status = 'offered'
        AND offer_expires_at > now();
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



CREATE OR REPLACE FUNCTION public.join_student_recess_waitlist(p_recess_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_student_id uuid := public.effective_student_user_id();
  v_section_id uuid;
  v_schedule public.recess_schedules%rowtype;
  v_now_local timestamp := now() AT TIME ZONE 'America/Bogota';
  v_local_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := extract(dow FROM (now() AT TIME ZONE 'America/Bogota'));
  v_start_at timestamptz;
  v_students_count bigint;
  v_waitlist_id uuid;
  v_waitlist_status text;
  v_offer_expires_at timestamptz;
  v_created_at timestamptz;
  v_position integer;
BEGIN
  IF auth.uid() IS NULL OR v_student_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT p.section_id INTO v_section_id
  FROM public.profiles p
  WHERE p.id = v_student_id AND p.role IN ('student', 'both') AND p.active;
  IF NOT FOUND OR v_section_id IS NULL THEN RAISE EXCEPTION 'student_only'; END IF;

  SELECT s.* INTO v_schedule
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  WHERE s.id = p_recess_schedule_id
    AND s.active AND s.weekday = v_dow
    AND t.section_id = v_section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_recess_schedule_for_student'; END IF;

  v_start_at := (v_local_date + v_schedule.start_time) AT TIME ZONE 'America/Bogota';
  IF now() >= v_start_at OR v_now_local::time >= v_schedule.end_time THEN
    RAISE EXCEPTION 'recess_waitlist_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = v_student_id
      AND o.scheduled_recess_schedule_id = v_schedule.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_local_date
  ) THEN
    RAISE EXCEPTION 'student_already_has_recess_order';
  END IF;

  UPDATE public.recess_order_waitlist w
  SET status = 'expired', updated_at = now()
  WHERE w.recess_schedule_id = v_schedule.id
    AND w.pickup_date = v_local_date
    AND w.user_id = v_student_id
    AND w.status = 'offered'
    AND w.offer_expires_at <= now();

  SELECT w.id, w.status, w.offer_expires_at, w.created_at
  INTO v_waitlist_id, v_waitlist_status, v_offer_expires_at, v_created_at
  FROM public.recess_order_waitlist w
  WHERE w.recess_schedule_id = v_schedule.id
    AND w.pickup_date = v_local_date
    AND w.user_id = v_student_id
    AND w.status IN ('waiting', 'offered')
    AND (w.status <> 'offered' OR w.offer_expires_at > now())
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT count(*)::integer + 1 INTO v_position
    FROM public.recess_order_waitlist w
    WHERE w.recess_schedule_id = v_schedule.id
      AND w.pickup_date = v_local_date
      AND w.status = 'waiting'
      AND (w.created_at, w.id) < (
        SELECT created_at, id FROM public.recess_order_waitlist WHERE id = v_waitlist_id
      );
    RETURN jsonb_build_object(
      'id', v_waitlist_id,
      'status', v_waitlist_status,
      'position', CASE WHEN v_waitlist_status = 'waiting' THEN coalesce(v_position, 1) ELSE NULL END,
      'offer_expires_at', v_offer_expires_at
    );
  END IF;

  IF v_schedule.max_students IS NULL THEN
    RAISE EXCEPTION 'recess_capacity_available';
  END IF;

  SELECT count(DISTINCT occupied.user_id)::bigint
  INTO v_students_count
  FROM (
    SELECT o.user_id
    FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = v_schedule.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_local_date
    UNION
    SELECT w.user_id
    FROM public.recess_order_waitlist w
    WHERE w.recess_schedule_id = v_schedule.id
      AND w.pickup_date = v_local_date
      AND w.status = 'offered'
      AND w.offer_expires_at > now()
  ) occupied;

  IF v_students_count < v_schedule.max_students THEN
    RAISE EXCEPTION 'recess_capacity_available';
  END IF;

  INSERT INTO public.recess_order_waitlist(recess_schedule_id, user_id, pickup_date)
  VALUES (v_schedule.id, v_student_id, v_local_date)
  RETURNING id INTO v_waitlist_id;

  SELECT count(*)::integer INTO v_position
  FROM public.recess_order_waitlist w
  WHERE w.recess_schedule_id = v_schedule.id
    AND w.pickup_date = v_local_date
    AND w.status = 'waiting'
    AND (w.created_at, w.id) <= (
      SELECT created_at, id FROM public.recess_order_waitlist WHERE id = v_waitlist_id
    );

  INSERT INTO public.audit_logs(action, actor_id, entity, entity_id, metadata)
  VALUES (
    'recess.waitlist_joined',
    auth.uid(),
    'recess_waitlist',
    v_waitlist_id::text,
    jsonb_build_object('schedule_id', v_schedule.id, 'pickup_date', v_local_date, 'position', v_position)
  );

  RETURN jsonb_build_object('id', v_waitlist_id, 'status', 'waiting', 'position', v_position);
END;
$function$;

REVOKE ALL ON FUNCTION public.join_student_recess_waitlist(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_student_recess_waitlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_recess_waitlist_status()
RETURNS TABLE(
  recess_schedule_id uuid,
  status text,
  position integer,
  offer_expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_student_id uuid := public.effective_student_user_id();
  v_local_date date := (now() AT TIME ZONE 'America/Bogota')::date;
BEGIN
  IF auth.uid() IS NULL OR v_student_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT w.recess_schedule_id,
         CASE
           WHEN w.status = 'offered' AND w.offer_expires_at <= now() THEN 'expired'
           WHEN w.status = 'waiting' AND (w.pickup_date + s.start_time) AT TIME ZONE 'America/Bogota' <= now() THEN 'expired'
           ELSE w.status
         END AS status,
         CASE WHEN w.status = 'waiting' AND (w.pickup_date + s.start_time) AT TIME ZONE 'America/Bogota' > now()
              THEN (
                SELECT count(*)::integer + 1
                FROM public.recess_order_waitlist ahead
                WHERE ahead.recess_schedule_id = w.recess_schedule_id
                  AND ahead.pickup_date = w.pickup_date
                  AND ahead.status = 'waiting'
                  AND (ahead.created_at, ahead.id) < (w.created_at, w.id)
              )
              ELSE NULL
         END AS position,
         w.offer_expires_at
  FROM public.recess_order_waitlist w
  JOIN public.recess_schedules s ON s.id = w.recess_schedule_id
  WHERE w.user_id = v_student_id
    AND w.pickup_date = v_local_date
    AND w.status IN ('waiting', 'offered', 'expired', 'cancelled')
  ORDER BY w.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_recess_waitlist_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_recess_waitlist_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_recess_waitlist_after_order_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_schedule public.recess_schedules%rowtype;
  v_pickup_date date;
  v_now_local timestamp := now() AT TIME ZONE 'America/Bogota';
  v_start_at timestamptz;
  v_students_count bigint;
  v_next_id uuid;
BEGIN
  IF OLD.scheduled_recess_schedule_id IS NULL OR OLD.scheduled_for IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IN ('cancelled', 'rejected') OR OLD.payment_status = 'rejected' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelled', 'rejected') AND NEW.payment_status IS DISTINCT FROM 'rejected' THEN RETURN NEW; END IF;

  v_pickup_date := (OLD.scheduled_for AT TIME ZONE 'America/Bogota')::date;
  IF v_pickup_date <> v_now_local::date THEN RETURN NEW; END IF;

  SELECT s.* INTO v_schedule
  FROM public.recess_schedules s
  WHERE s.id = OLD.scheduled_recess_schedule_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_schedule.active OR v_schedule.max_students IS NULL THEN RETURN NEW; END IF;

  v_start_at := (v_pickup_date + v_schedule.start_time) AT TIME ZONE 'America/Bogota';
  IF now() >= v_start_at OR v_now_local::time >= v_schedule.end_time THEN RETURN NEW; END IF;

  UPDATE public.recess_order_waitlist
  SET status = 'expired', updated_at = now()
  WHERE recess_schedule_id = v_schedule.id
    AND pickup_date = v_pickup_date
    AND status = 'offered'
    AND offer_expires_at <= now();

  SELECT count(DISTINCT occupied.user_id)::bigint
  INTO v_students_count
  FROM (
    SELECT o.user_id
    FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = v_schedule.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_pickup_date
    UNION
    SELECT w.user_id
    FROM public.recess_order_waitlist w
    WHERE w.recess_schedule_id = v_schedule.id
      AND w.pickup_date = v_pickup_date
      AND w.status = 'offered'
      AND w.offer_expires_at > now()
  ) occupied;

  IF v_students_count >= v_schedule.max_students THEN RETURN NEW; END IF;

  SELECT w.id INTO v_next_id
  FROM public.recess_order_waitlist w
  WHERE w.recess_schedule_id = v_schedule.id
    AND w.pickup_date = v_pickup_date
    AND w.status = 'waiting'
  ORDER BY w.created_at, w.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_next_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.recess_order_waitlist
  SET status = 'offered',
      offered_at = now(),
      offer_expires_at = v_start_at,
      updated_at = now()
  WHERE id = v_next_id;

  INSERT INTO public.audit_logs(action, actor_id, entity, entity_id, metadata)
  VALUES (
    'recess.waitlist_offer_made',
    NULL,
    'recess_waitlist',
    v_next_id::text,
    jsonb_build_object('schedule_id', v_schedule.id, 'pickup_date', v_pickup_date, 'expires_at', v_start_at)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_promote_recess_waitlist_after_order_release ON public.orders;
CREATE TRIGGER trg_promote_recess_waitlist_after_order_release
AFTER UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.promote_recess_waitlist_after_order_release();


COMMIT;
