-- Atomically persist a menu product and its nutrition record.
-- A failure in either write rolls back both rows, avoiding a product-only partial save.
CREATE OR REPLACE FUNCTION public.admin_save_product_with_nutrition(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_image_url text,
  p_category_id uuid,
  p_stock integer,
  p_available boolean,
  p_detailed_description text,
  p_ingredients text,
  p_allergens text,
  p_calories numeric,
  p_protein_g numeric,
  p_carbohydrates_g numeric,
  p_fat_g numeric,
  p_fiber_g numeric,
  p_vegetarian boolean,
  p_healthy_choice boolean,
  p_ingredients_verified boolean,
  p_nutrition_verified boolean,
  p_nutrition_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_product_id uuid;
  v_name text := trim(COALESCE(p_name, ''));
  v_ingredients text := NULLIF(trim(COALESCE(p_ingredients, '')), '');
  v_source text := COALESCE(p_nutrition_source, 'manual');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'product_name_required';
  END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_price > 100000000 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;
  IF p_stock IS NULL OR p_stock < 0 THEN
    RAISE EXCEPTION 'invalid_stock';
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'category_required';
  END IF;
  IF p_available IS TRUE AND (v_ingredients IS NULL OR COALESCE(p_ingredients_verified, false) IS FALSE) THEN
    RAISE EXCEPTION 'ingredients_must_be_verified_before_publish';
  END IF;
  IF COALESCE(p_ingredients_verified, false) AND v_ingredients IS NULL THEN
    RAISE EXCEPTION 'ingredients_required_for_verification';
  END IF;
  IF (p_calories IS NOT NULL AND p_calories < 0)
    OR (p_protein_g IS NOT NULL AND p_protein_g < 0)
    OR (p_carbohydrates_g IS NOT NULL AND p_carbohydrates_g < 0)
    OR (p_fat_g IS NOT NULL AND p_fat_g < 0)
    OR (p_fiber_g IS NOT NULL AND p_fiber_g < 0) THEN
    RAISE EXCEPTION 'invalid_nutrition_value';
  END IF;
  IF v_source NOT IN ('manual', 'ai_draft', 'label') THEN
    RAISE EXCEPTION 'invalid_nutrition_source';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      name, description, price, image_url, category_id, stock, available
    ) VALUES (
      v_name,
      NULLIF(trim(COALESCE(p_description, '')), ''),
      p_price,
      NULLIF(trim(COALESCE(p_image_url, '')), ''),
      p_category_id,
      p_stock,
      COALESCE(p_available, false)
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products
    SET name = v_name,
        description = NULLIF(trim(COALESCE(p_description, '')), ''),
        price = p_price,
        image_url = NULLIF(trim(COALESCE(p_image_url, '')), ''),
        category_id = p_category_id,
        stock = p_stock,
        available = COALESCE(p_available, false),
        updated_at = now()
    WHERE id = p_product_id
    RETURNING id INTO v_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_not_found';
    END IF;
  END IF;

  INSERT INTO public.product_nutrition (
    product_id, detailed_description, ingredients, allergens, calories,
    protein_g, carbohydrates_g, fat_g, fiber_g, vegetarian, healthy_choice,
    ingredients_verified, nutrition_verified, nutrition_source, updated_at
  ) VALUES (
    v_product_id,
    NULLIF(trim(COALESCE(p_detailed_description, '')), ''),
    v_ingredients,
    NULLIF(trim(COALESCE(p_allergens, '')), ''),
    p_calories, p_protein_g, p_carbohydrates_g, p_fat_g, p_fiber_g,
    COALESCE(p_vegetarian, false),
    COALESCE(p_healthy_choice, false),
    COALESCE(p_ingredients_verified, false),
    COALESCE(p_nutrition_verified, false),
    v_source,
    now()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    detailed_description = EXCLUDED.detailed_description,
    ingredients = EXCLUDED.ingredients,
    allergens = EXCLUDED.allergens,
    calories = EXCLUDED.calories,
    protein_g = EXCLUDED.protein_g,
    carbohydrates_g = EXCLUDED.carbohydrates_g,
    fat_g = EXCLUDED.fat_g,
    fiber_g = EXCLUDED.fiber_g,
    vegetarian = EXCLUDED.vegetarian,
    healthy_choice = EXCLUDED.healthy_choice,
    ingredients_verified = EXCLUDED.ingredients_verified,
    nutrition_verified = EXCLUDED.nutrition_verified,
    nutrition_source = EXCLUDED.nutrition_source,
    updated_at = now();

  INSERT INTO public.audit_logs(action, actor_id, actor_email, entity, entity_id, metadata)
  SELECT
    'product.save_with_nutrition',
    auth.uid(),
    au.email,
    'product',
    v_product_id::text,
    jsonb_build_object('available', COALESCE(p_available, false), 'nutrition_saved', true)
  FROM auth.users au
  WHERE au.id = auth.uid();

  RETURN v_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_product_with_nutrition(
  uuid, text, text, numeric, text, uuid, integer, boolean, text, text, text,
  numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_product_with_nutrition(
  uuid, text, text, numeric, text, uuid, integer, boolean, text, text, text,
  numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, text
) TO authenticated;
