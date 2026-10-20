BEGIN;

-- Keep the existing transaction checks, stock locks, payment validation and
-- general pickup-window configuration unchanged. Only remove the hard cap
-- for section recesses; max_students remains a workload indicator.
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

  -- max_students is an operational workload indicator, not a cutoff.
  -- Recess orders continue into the transient production queue; calculated turns
  -- are never written back to orders or any other Supabase table.

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

-- Section recesses may accept orders beyond the advisory student count.
-- Old waitlist rows are retained for history, but no longer block checkout.
DROP TRIGGER IF EXISTS guard_recess_waitlist_offer ON public.orders;
DROP FUNCTION IF EXISTS public.guard_recess_waitlist_offer();
DROP TRIGGER IF EXISTS refresh_recess_waitlist_after_order_change ON public.orders;
DROP FUNCTION IF EXISTS public.refresh_recess_waitlist_after_order_change();

-- Retire the legacy persistent waitlist entry points so new turns are computed
-- from ordinary orders on demand and are never stored as turn records.
REVOKE ALL ON FUNCTION public.join_student_recess_waitlist(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_student_recess_waitlist(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_recess_waitlist(uuid, date) FROM PUBLIC, anon, authenticated;

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
  can_order boolean,
  window_open boolean,
  waitlist_status text,
  waitlist_position bigint,
  offer_expires_at timestamptz,
  server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_student public.profiles%ROWTYPE;
  v_time time := (now() AT TIME ZONE 'America/Bogota')::time;
  v_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::integer;
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
         (v_time < s.end_time),
         (v_time < s.end_time),
         NULL::text,
         NULL::bigint,
         NULL::timestamptz,
         now()
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT o.user_id)::bigint AS students_count
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

CREATE OR REPLACE FUNCTION public.get_student_recess_production_turns()
RETURNS TABLE(
  order_id uuid,
  order_number text,
  recess_schedule_id uuid,
  queue_position bigint,
  queue_size bigint,
  estimated_pickup_at timestamptz,
  recess_ends_at timestamptz,
  is_preordered boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_student_id uuid := public.effective_student_user_id();
  v_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_student_id AND p.role IN ('student', 'both')
  ) THEN
    RAISE EXCEPTION 'student_only';
  END IF;

  RETURN QUERY
  WITH active_recesses AS (
    SELECT s.id,
           (v_date + s.start_time) AT TIME ZONE 'America/Bogota' AS start_at,
           (v_date + s.end_time) AT TIME ZONE 'America/Bogota' AS end_at
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    JOIN public.profiles p ON p.id = v_student_id
    WHERE s.active AND s.weekday = v_dow
      AND t.section_id = p.section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
      AND (v_date + s.end_time) AT TIME ZONE 'America/Bogota' > now()
  ),
  candidate_orders AS (
    SELECT o.id AS order_id,
           o.order_number,
           o.user_id,
           o.scheduled_recess_schedule_id AS recess_schedule_id,
           o.created_at,
           greatest(coalesce(o.estimated_minutes, 10), 1)::integer AS prep_minutes,
           coalesce(o.preordered, false) AS is_preordered,
           r.start_at,
           r.end_at
    FROM public.orders o
    JOIN active_recesses r ON r.id = o.scheduled_recess_schedule_id
    WHERE o.scheduled_for IS NOT NULL
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
      AND o.status IN ('pending', 'preparing')
      AND o.payment_status = 'confirmed'
      AND o.pickup_outcome IS DISTINCT FROM 'unclaimed'
  ),
  ranked_orders AS (
    SELECT c.*,
           row_number() OVER (
             PARTITION BY c.recess_schedule_id
             ORDER BY CASE WHEN c.is_preordered THEN 0 ELSE 1 END, c.created_at, c.order_id
           ) AS queue_position,
           count(*) OVER (PARTITION BY c.recess_schedule_id) AS queue_size,
           sum(c.prep_minutes) OVER (
             PARTITION BY c.recess_schedule_id
             ORDER BY CASE WHEN c.is_preordered THEN 0 ELSE 1 END, c.created_at, c.order_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS cumulative_minutes
    FROM candidate_orders c
  )
  SELECT r.order_id,
         r.order_number,
         r.recess_schedule_id,
         r.queue_position,
         r.queue_size,
         greatest(r.start_at, now()) + (r.cumulative_minutes::double precision * interval '1 minute'),
         r.end_at,
         r.is_preordered
  FROM ranked_orders r
  WHERE r.user_id = v_student_id
  ORDER BY r.queue_position;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_recess_production_turns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_recess_production_turns() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
