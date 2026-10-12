-- Save a staff menu product and its nutrition/discoverability fields as one transaction.
-- PostgreSQL rolls back the product, nutrition, availability, and their audit events together if any step fails.
CREATE OR REPLACE FUNCTION public.staff_save_menu_product_with_nutrition(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_image_url text,
  p_category_id uuid,
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
  p_nutrition_source text,
  p_available boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- These existing routines preserve their validations and staff authorization checks.
  -- A raised exception aborts this outer transaction, including all nested writes.
  v_product_id := public.staff_save_menu_product(
    p_product_id, p_name, p_description, p_price, p_image_url, p_category_id
  );

  PERFORM public.staff_save_product_nutrition(
    v_product_id, p_detailed_description, p_ingredients, p_allergens,
    p_calories, p_protein_g, p_carbohydrates_g, p_fat_g, p_fiber_g,
    p_vegetarian, p_healthy_choice, p_ingredients_verified,
    p_nutrition_verified, p_nutrition_source
  );

  PERFORM public.staff_set_product_availability(v_product_id, p_available);

  RETURN v_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_save_menu_product_with_nutrition(
  uuid, text, text, numeric, text, uuid, text, text, text,
  numeric, numeric, numeric, numeric, numeric,
  boolean, boolean, boolean, boolean, text, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.staff_save_menu_product_with_nutrition(
  uuid, text, text, numeric, text, uuid, text, text, text,
  numeric, numeric, numeric, numeric, numeric,
  boolean, boolean, boolean, boolean, text, boolean
) TO authenticated;
