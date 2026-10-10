-- Staff operational workspace: narrow role-scoped RPCs and privacy-conscious presence.
-- Staff may operate the cafeteria but cannot administer users or approve financial movements.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON public.user_presence(last_seen_at DESC);
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_presence FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_ping_presence()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.active = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.user_presence(user_id, last_seen_at)
  VALUES (v_user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_online_users()
RETURNS TABLE(user_id uuid, full_name text, role text, last_seen_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.role, up.last_seen_at
  FROM public.user_presence up
  JOIN public.profiles p ON p.id = up.user_id
  WHERE p.active = true AND up.last_seen_at >= now() - interval '90 seconds'
  ORDER BY up.last_seen_at DESC
  LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_menu_catalog()
RETURNS TABLE(
  id uuid, name text, description text, price numeric, image_url text,
  category_id uuid, category_name text, stock integer, available boolean,
  detailed_description text, ingredients text, allergens text,
  calories numeric, protein_g numeric, carbohydrates_g numeric, fat_g numeric, fiber_g numeric,
  vegetarian boolean, healthy_choice boolean,
  ingredients_verified boolean, nutrition_verified boolean, nutrition_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT pr.id, pr.name, pr.description, pr.price, pr.image_url,
         pr.category_id, c.name, pr.stock, pr.available,
         n.detailed_description, n.ingredients, n.allergens,
         n.calories, n.protein_g, n.carbohydrates_g, n.fat_g, n.fiber_g,
         COALESCE(n.vegetarian, false), COALESCE(n.healthy_choice, false),
         COALESCE(n.ingredients_verified, false), COALESCE(n.nutrition_verified, false),
         COALESCE(n.nutrition_source, 'manual')
  FROM public.products pr
  LEFT JOIN public.categories c ON c.id = pr.category_id
  LEFT JOIN public.product_nutrition n ON n.product_id = pr.id
  ORDER BY pr.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_categories()
RETURNS TABLE(id uuid, name text, description text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT c.id, c.name, c.description, c.created_at
    FROM public.categories c ORDER BY c.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_upsert_category(
  p_category_id uuid, p_name text, p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE v_id uuid; v_name text := trim(COALESCE(p_name, ''));
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN RAISE EXCEPTION 'invalid_category_name'; END IF;
  IF p_category_id IS NULL THEN
    INSERT INTO public.categories(name, description)
    VALUES(v_name, NULLIF(trim(COALESCE(p_description, '')), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.categories
       SET name = v_name, description = NULLIF(trim(COALESCE(p_description, '')), '')
     WHERE id = p_category_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  END IF;
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  SELECT auth.uid(), au.email, 'menu.category_saved', 'category', v_id::text,
         jsonb_build_object('name', v_name)
  FROM auth.users au WHERE au.id = auth.uid();
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_delete_category(p_category_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE category_id = p_category_id) THEN
    RAISE EXCEPTION 'category_in_use';
  END IF;
  DELETE FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  SELECT auth.uid(), au.email, 'menu.category_deleted', 'category', p_category_id::text, '{}'::jsonb
  FROM auth.users au WHERE au.id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_save_menu_product(
  p_product_id uuid, p_name text, p_description text, p_price numeric,
  p_image_url text, p_category_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE v_id uuid; v_name text := trim(COALESCE(p_name, ''));
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'product_name_required'; END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price > 100000000 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'category_required';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products(name, description, price, image_url, category_id, stock, available)
    VALUES(v_name, NULLIF(trim(COALESCE(p_description, '')), ''), p_price,
           NULLIF(trim(COALESCE(p_image_url, '')), ''), p_category_id, 0, false)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products
       SET name = v_name,
           description = NULLIF(trim(COALESCE(p_description, '')), ''),
           price = p_price,
           image_url = NULLIF(trim(COALESCE(p_image_url, '')), ''),
           category_id = p_category_id,
           updated_at = now()
     WHERE id = p_product_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  SELECT auth.uid(), au.email, 'menu.product_saved', 'product', v_id::text,
         jsonb_build_object('name', v_name, 'price', p_price)
  FROM auth.users au WHERE au.id = auth.uid();
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_save_product_nutrition(
  p_product_id uuid, p_detailed_description text, p_ingredients text, p_allergens text,
  p_calories numeric, p_protein_g numeric, p_carbohydrates_g numeric, p_fat_g numeric,
  p_fiber_g numeric, p_vegetarian boolean, p_healthy_choice boolean,
  p_ingredients_verified boolean, p_nutrition_verified boolean, p_nutrition_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE v_source text := COALESCE(p_nutrition_source, 'manual');
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;
  IF p_calories < 0 OR p_protein_g < 0 OR p_carbohydrates_g < 0 OR p_fat_g < 0 OR p_fiber_g < 0 THEN
    RAISE EXCEPTION 'invalid_nutrition_value';
  END IF;
  IF v_source NOT IN ('manual', 'ai_draft', 'label') THEN RAISE EXCEPTION 'invalid_nutrition_source'; END IF;
  IF COALESCE(p_ingredients_verified, false) AND length(trim(COALESCE(p_ingredients, ''))) = 0 THEN
    RAISE EXCEPTION 'ingredients_required_for_verification';
  END IF;

  INSERT INTO public.product_nutrition(
    product_id, detailed_description, ingredients, allergens, calories, protein_g,
    carbohydrates_g, fat_g, fiber_g, vegetarian, healthy_choice,
    ingredients_verified, nutrition_verified, nutrition_source, updated_at
  ) VALUES (
    p_product_id, NULLIF(trim(COALESCE(p_detailed_description, '')), ''),
    NULLIF(trim(COALESCE(p_ingredients, '')), ''), NULLIF(trim(COALESCE(p_allergens, '')), ''),
    p_calories, p_protein_g, p_carbohydrates_g, p_fat_g, p_fiber_g,
    COALESCE(p_vegetarian, false), COALESCE(p_healthy_choice, false),
    COALESCE(p_ingredients_verified, false), COALESCE(p_nutrition_verified, false), v_source, now()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    detailed_description = EXCLUDED.detailed_description,
    ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens,
    calories = EXCLUDED.calories, protein_g = EXCLUDED.protein_g,
    carbohydrates_g = EXCLUDED.carbohydrates_g, fat_g = EXCLUDED.fat_g, fiber_g = EXCLUDED.fiber_g,
    vegetarian = EXCLUDED.vegetarian, healthy_choice = EXCLUDED.healthy_choice,
    ingredients_verified = EXCLUDED.ingredients_verified,
    nutrition_verified = EXCLUDED.nutrition_verified,
    nutrition_source = EXCLUDED.nutrition_source, updated_at = now();

  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  SELECT auth.uid(), au.email, 'menu.nutrition_saved', 'product', p_product_id::text,
         jsonb_build_object('ingredients_verified', COALESCE(p_ingredients_verified, false),
                            'nutrition_verified', COALESCE(p_nutrition_verified, false),
                            'source', v_source)
  FROM auth.users au WHERE au.id = auth.uid();
  RETURN p_product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_set_product_availability(p_product_id uuid, p_available boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF COALESCE(p_available, false) AND NOT EXISTS (
    SELECT 1 FROM public.product_nutrition n
    WHERE n.product_id = p_product_id
      AND n.ingredients_verified = true
      AND length(trim(COALESCE(n.ingredients, ''))) > 0
      AND length(trim(COALESCE(n.allergens, ''))) > 0
  ) THEN
    RAISE EXCEPTION 'nutrition_and_allergens_must_be_reviewed';
  END IF;
  UPDATE public.products SET available = COALESCE(p_available, false), updated_at = now()
  WHERE id = p_product_id;
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  SELECT auth.uid(), au.email, 'menu.product_availability_changed', 'product', p_product_id::text,
         jsonb_build_object('available', COALESCE(p_available, false))
  FROM auth.users au WHERE au.id = auth.uid();
  RETURN COALESCE(p_available, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_adjust_inventory(
  p_product_id uuid, p_new_stock integer, p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE v_product public.products%rowtype; v_movement_id uuid;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN RAISE EXCEPTION 'invalid_stock'; END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 OR length(trim(COALESCE(p_reason, ''))) > 240 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF p_new_stock = v_product.stock THEN RAISE EXCEPTION 'stock_unchanged'; END IF;

  PERFORM set_config('quickbite.inventory_movement_type', 'adjustment', true);
  PERFORM set_config('quickbite.inventory_movement_reason', trim(p_reason), true);
  UPDATE public.products SET stock = p_new_stock, updated_at = now() WHERE id = p_product_id;
  SELECT im.id INTO v_movement_id
  FROM public.inventory_movements im
  WHERE im.product_id = p_product_id AND im.user_id = auth.uid()
    AND im.previous_stock = v_product.stock AND im.new_stock = p_new_stock
    AND im.created_at >= clock_timestamp() - interval '5 seconds'
  ORDER BY im.created_at DESC LIMIT 1;
  IF v_movement_id IS NULL THEN RAISE EXCEPTION 'inventory_movement_not_recorded'; END IF;
  RETURN v_movement_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_inventory_movements(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid, product_id uuid, product_name text, movement_type text, quantity integer,
  previous_stock integer, new_stock integer, actor_name text, reason text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT im.id, im.product_id, pr.name, im.movement_type, im.quantity,
         im.previous_stock, im.new_stock, COALESCE(p.full_name, 'Sistema'),
         im.reason, im.created_at
  FROM public.inventory_movements im
  LEFT JOIN public.products pr ON pr.id = im.product_id
  LEFT JOIN public.profiles p ON p.id = im.user_id
  ORDER BY im.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_topup_requests(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid, user_id uuid, full_name text, amount numeric, method text,
  reference text, comment text, status text, rejection_reason text,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT r.id, r.user_id, COALESCE(p.full_name, 'Usuario'), r.amount, r.method,
         r.reference, r.comment, r.status, r.rejection_reason, r.created_at, r.reviewed_at
  FROM public.wallet_topup_requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_list_own_activity(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid, action text, entity text, entity_id text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at
  FROM public.audit_logs a WHERE a.actor_id = auth.uid()
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_review_order(
  p_order_id uuid, p_approve boolean, p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_item record;
  v_actor_email text;
  v_old_status text;
  v_next_status text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_already_reviewed'; END IF;
  IF COALESCE(p_approve, false) THEN
    IF v_order.payment_status <> 'confirmed' THEN RAISE EXCEPTION 'payment_not_confirmed'; END IF;
    PERFORM set_config('quickbite.internal_order_tx', '1', true);
    UPDATE public.orders SET status = 'preparing', updated_at = now()
    WHERE id = p_order_id;
    v_next_status := 'preparing';
    IF v_order.user_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, order_id, type, title, body)
      VALUES(v_order.user_id, v_order.id, 'order_status', 'Pedido aceptado',
             format('Tu pedido %s fue aceptado y ya está en preparación.', v_order.order_number));
    END IF;
  ELSE
    IF v_order.payment_status <> 'pending' THEN
      RAISE EXCEPTION 'paid_order_requires_admin_cancellation';
    END IF;
    PERFORM set_config('quickbite.inventory_movement_type', 'return', true);
    PERFORM set_config('quickbite.inventory_movement_reason',
      left('Pedido rechazado por Staff: ' || COALESCE(NULLIF(trim(p_reason), ''), 'sin motivo indicado'), 240), true);
    FOR v_item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
      IF v_item.product_id IS NOT NULL THEN
        UPDATE public.products SET stock = stock + v_item.quantity, updated_at = now()
        WHERE id = v_item.product_id;
      END IF;
    END LOOP;
    PERFORM set_config('quickbite.internal_order_tx', '1', true);
    UPDATE public.orders SET status = 'rejected', cancellation_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
      updated_at = now() WHERE id = p_order_id;
    v_next_status := 'rejected';
    IF v_order.user_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, order_id, type, title, body)
      VALUES(v_order.user_id, v_order.id, 'order_status', 'Pedido rechazado',
             'Tu pedido fue rechazado antes de confirmar el pago. El inventario fue restaurado.');
    END IF;
  END IF;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  VALUES(auth.uid(), v_actor_email, 'order.staff_review', 'order', p_order_id::text,
         jsonb_build_object('from', v_order.status, 'to', v_next_status,
                            'reason', left(trim(COALESCE(p_reason, '')), 240)));
  RETURN p_order_id;
END;
$function$;

-- Prevent direct RPC callers from beginning preparation before payment confirmation.
CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_order_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor_email text;
  v_title text;
  v_body text;
  v_old_status text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_status NOT IN ('preparing', 'ready', 'delivered') THEN RAISE EXCEPTION 'invalid_order_status'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status = 'delivered' THEN RAISE EXCEPTION 'delivered_order_immutable'; END IF;
  IF v_order.status = 'rejected' THEN RAISE EXCEPTION 'rejected_order_immutable'; END IF;
  v_old_status := v_order.status;
  IF p_status = 'preparing' THEN
    RAISE EXCEPTION 'order_review_required';
  ELSIF p_status = 'ready' AND (v_order.status <> 'preparing' OR v_order.payment_status <> 'confirmed') THEN
    RAISE EXCEPTION 'invalid_order_transition';
  ELSIF p_status = 'delivered' AND v_order.status <> 'ready' THEN
    RAISE EXCEPTION 'invalid_order_transition';
  END IF;

  PERFORM set_config('quickbite.internal_order_tx', '1', true);
  UPDATE public.orders
  SET status = p_status, updated_at = now(),
      ready_at = CASE WHEN p_status = 'ready' THEN COALESCE(ready_at, now()) ELSE ready_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
  WHERE id = p_order_id;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = auth.uid();
  IF p_status = 'ready' THEN
    v_title := 'Tu pedido está listo';
    v_body := format('Tu pedido %s está listo para recoger. Código: %s.', v_order.order_number, COALESCE(v_order.pickup_code, 'consulta en caja'));
  ELSE
    v_title := 'Pedido entregado';
    v_body := format('Tu pedido %s fue marcado como entregado.', v_order.order_number);
  END IF;
  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, order_id, type, title, body)
    VALUES(v_order.user_id, v_order.id, 'order_status', v_title, v_body);
  END IF;
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  VALUES(auth.uid(), v_actor_email, 'order.staff_status_change', 'order', p_order_id::text,
         jsonb_build_object('from', v_old_status, 'to', p_status));
  RETURN p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_ping_presence() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_online_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_menu_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_upsert_category(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_category(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_save_menu_product(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_save_product_nutrition(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_set_product_availability(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_adjust_inventory(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_inventory_movements(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_topup_requests(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_own_activity(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_review_order(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_update_order_status(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.staff_ping_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_online_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_menu_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_upsert_category(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_delete_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_save_menu_product(uuid, text, text, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_save_product_nutrition(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_product_availability(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_adjust_inventory(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_inventory_movements(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_topup_requests(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_own_activity(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_review_order(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_update_order_status(uuid, text) TO authenticated;
