-- Product detail/verification metadata and ingredient-level dietary preferences.
ALTER TABLE public.product_nutrition
  ADD COLUMN IF NOT EXISTS detailed_description text,
  ADD COLUMN IF NOT EXISTS ingredients_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nutrition_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nutrition_source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_nutrition'::regclass
      AND conname = 'product_nutrition_source_check'
  ) THEN
    ALTER TABLE public.product_nutrition
      ADD CONSTRAINT product_nutrition_source_check
      CHECK (nutrition_source IN ('manual', 'ai_draft', 'label'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.student_ingredient_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ingredient_name text NOT NULL,
  ingredient_key text NOT NULL,
  reason text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_ingredient_blocks_name_check
    CHECK (length(trim(ingredient_name)) BETWEEN 2 AND 100),
  CONSTRAINT student_ingredient_blocks_key_check
    CHECK (length(trim(ingredient_key)) BETWEEN 2 AND 100),
  CONSTRAINT student_ingredient_blocks_unique
    UNIQUE (student_user_id, ingredient_key)
);

CREATE INDEX IF NOT EXISTS idx_student_ingredient_blocks_student
  ON public.student_ingredient_blocks(student_user_id);

ALTER TABLE public.student_ingredient_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_ingredient_blocks_no_direct_access ON public.student_ingredient_blocks;
CREATE POLICY student_ingredient_blocks_no_direct_access
  ON public.student_ingredient_blocks FOR ALL TO public
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.student_ingredient_blocks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_student_food(p_student_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.parent_student_links l
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE l.parent_user_id = auth.uid()
        AND l.student_user_id = p_student_user_id
        AND l.active = true
        AND actor.role = 'parent'
        AND actor.active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles actor
      WHERE actor.id = auth.uid()
        AND actor.id = p_student_user_id
        AND actor.role IN ('student', 'both', 'student_parent')
        AND actor.active = true
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_student_food(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_student_food(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_parent_food_controls(p_student_user_id uuid)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  description text,
  price numeric,
  image_url text,
  category_id uuid,
  category_name text,
  blocked boolean,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.can_manage_student_food(p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.description, p.price, p.image_url, p.category_id, c.name,
         (b.id IS NOT NULL), b.reason
  FROM public.products p
  LEFT JOIN public.categories c ON c.id = p.category_id
  LEFT JOIN public.parent_food_blocks b
    ON b.product_id = p.id AND b.student_user_id = p_student_user_id
  WHERE p.available = true OR public.is_admin()
  ORDER BY c.name NULLS LAST, p.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_parent_food_controls(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_parent_food_controls(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_parent_food_block(
  p_student_user_id uuid,
  p_product_id uuid,
  p_blocked boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.can_manage_student_food(p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  IF p_blocked THEN
    INSERT INTO public.parent_food_blocks(parent_user_id, student_user_id, product_id, reason)
    VALUES (auth.uid(), p_student_user_id, p_product_id, NULLIF(trim(p_reason), ''))
    ON CONFLICT (student_user_id, product_id)
    DO UPDATE SET parent_user_id = EXCLUDED.parent_user_id, reason = EXCLUDED.reason;
  ELSE
    DELETE FROM public.parent_food_blocks
    WHERE student_user_id = p_student_user_id
      AND product_id = p_product_id;
  END IF;

  RETURN p_blocked;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_parent_food_block(uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_parent_food_block(uuid, uuid, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_ingredient_blocks(p_student_user_id uuid)
RETURNS TABLE(ingredient_name text, reason text, created_at timestamptz, created_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.can_manage_student_food(p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT b.ingredient_name, b.reason, b.created_at, b.created_by
  FROM public.student_ingredient_blocks b
  WHERE b.student_user_id = p_student_user_id
  ORDER BY b.ingredient_name;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_student_ingredient_blocks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_ingredient_blocks(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_student_ingredient_block(
  p_student_user_id uuid,
  p_ingredient_name text,
  p_blocked boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_name text := trim(regexp_replace(COALESCE(p_ingredient_name, ''), '[[:space:]]+', ' ', 'g'));
  v_key text;
BEGIN
  IF NOT public.can_manage_student_food(p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_key := trim(regexp_replace(lower(v_name), '[^[:alnum:]]+', ' ', 'g'));
  v_key := trim(regexp_replace(v_key, '[[:space:]]+', ' ', 'g'));

  IF length(v_name) < 2 OR length(v_name) > 100 OR length(v_key) < 2 OR length(v_key) > 100 THEN
    RAISE EXCEPTION 'invalid_ingredient_name';
  END IF;

  IF p_blocked THEN
    INSERT INTO public.student_ingredient_blocks(
      student_user_id, ingredient_name, ingredient_key, reason, created_by
    )
    VALUES (
      p_student_user_id, v_name, v_key, NULLIF(trim(p_reason), ''), auth.uid()
    )
    ON CONFLICT (student_user_id, ingredient_key)
    DO UPDATE SET
      ingredient_name = EXCLUDED.ingredient_name,
      reason = EXCLUDED.reason,
      created_by = EXCLUDED.created_by,
      created_at = now();
  ELSE
    DELETE FROM public.student_ingredient_blocks b
    WHERE b.student_user_id = p_student_user_id
      AND b.ingredient_key = v_key;
  END IF;

  RETURN p_blocked;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_student_ingredient_block(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_ingredient_block(uuid, text, boolean, text) TO authenticated, service_role;

-- Hide foods already blocked by product or a blocked ingredient from the normal catalog.
DROP POLICY IF EXISTS products_public_read_available ON public.products;
CREATE POLICY products_public_read_available
  ON public.products FOR SELECT TO public
  USING (
    public.is_admin()
    OR (
      available = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.parent_food_blocks b
        WHERE b.student_user_id = public.effective_student_user_id()
          AND b.product_id = products.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_nutrition n
        CROSS JOIN LATERAL regexp_split_to_table(
          COALESCE(n.ingredients, ''),
          E'[,;\\n\\r]+'
        ) AS ingredient(value)
        JOIN public.student_ingredient_blocks sb
          ON sb.student_user_id = public.effective_student_user_id()
        WHERE n.product_id = products.id
          AND position(
            ' ' || sb.ingredient_key || ' '
            IN ' ' || trim(regexp_replace(lower(ingredient.value), '[^[:alnum:]]+', ' ', 'g')) || ' '
          ) > 0
      )
    )
  );

-- The server transaction also enforces restrictions; UI filtering is not an authorization boundary.
CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id uuid,
  p_payment_method text,
  p_payment_status text,
  p_status text,
  p_pickup_code text,
  p_estimated_minutes integer,
  p_payment_reference text,
  p_items jsonb,
  p_notes text,
  p_request_id uuid
)
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
          ON (t.course_id = p.course_id
              OR (t.grade_id = p.grade_id AND t.course_id IS NULL)
              OR (t.section_id = p.section_id AND t.grade_id IS NULL AND t.course_id IS NULL))
        JOIN public.recess_schedules s ON s.id = t.recess_schedule_id
        WHERE p.id = p_user_id AND s.active AND s.weekday = v_dow
          AND v_local_time >= s.start_time AND v_local_time < s.end_time
      ) INTO v_recess_active;
      IF NOT v_recess_active THEN RAISE EXCEPTION 'no_active_recess_window'; END IF;
    END IF;
  END IF;

  IF v_windows_enabled THEN
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
      CASE WHEN v_windows_enabled THEN v_slot.id ELSE NULL END
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

-- Match admin-managed records and ingredient controls against the same saved list.
REVOKE ALL ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) TO authenticated, service_role;
