-- Phase 5: secure parent family dashboard summary.
-- Only an authenticated parent with an active student link can read the summary.
CREATE OR REPLACE FUNCTION public.get_parent_family_dashboard(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $function$
DECLARE
  v_today date := (current_timestamp AT TIME ZONE 'America/Bogota')::date;
  v_month_start date := date_trunc('month', current_timestamp AT TIME ZONE 'America/Bogota')::date;
  v_today_spent numeric := 0;
  v_month_spent numeric := 0;
  v_today_orders integer := 0;
  v_month_orders integer := 0;
  v_calories numeric := 0;
  v_protein numeric := 0;
  v_fiber numeric := 0;
  v_points integer := 0;
  v_favorites integer := 0;
  v_unread_alerts integer := 0;
  v_blocked integer := 0;
  v_daily_limit numeric := null;
  v_weekly_limit numeric := null;
  v_monthly_limit numeric := null;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parent_student_links l
    WHERE l.parent_user_id = auth.uid()
      AND l.student_user_id = p_student_user_id
      AND l.active = true
  ) THEN
    RAISE EXCEPTION 'student_not_linked';
  END IF;

  SELECT COALESCE(SUM(o.total), 0), COUNT(*)
  INTO v_today_spent, v_today_orders
  FROM public.orders o
  WHERE o.user_id = p_student_user_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status = 'confirmed'
    AND (o.created_at AT TIME ZONE 'America/Bogota')::date = v_today;

  SELECT COALESCE(SUM(o.total), 0), COUNT(*)
  INTO v_month_spent, v_month_orders
  FROM public.orders o
  WHERE o.user_id = p_student_user_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status = 'confirmed'
    AND (o.created_at AT TIME ZONE 'America/Bogota')::date >= v_month_start;

  SELECT
    COALESCE(SUM(oi.quantity * COALESCE(n.calories, 0)), 0),
    COALESCE(SUM(oi.quantity * COALESCE(n.protein_g, 0)), 0),
    COALESCE(SUM(oi.quantity * COALESCE(n.fiber_g, 0)), 0)
  INTO v_calories, v_protein, v_fiber
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.product_nutrition n ON n.product_id = oi.product_id
  WHERE o.user_id = p_student_user_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status = 'confirmed'
    AND (o.created_at AT TIME ZONE 'America/Bogota')::date = v_today;

  SELECT COALESCE(SUM(lp.points), 0)
  INTO v_points
  FROM public.loyalty_point_ledger lp
  WHERE lp.user_id = p_student_user_id;

  SELECT COUNT(*)
  INTO v_favorites
  FROM public.favorites
  WHERE user_id = p_student_user_id;

  SELECT COUNT(*)
  INTO v_unread_alerts
  FROM public.notifications n
  WHERE n.user_id = p_student_user_id
    AND n.read_at IS NULL;

  SELECT COUNT(*)
  INTO v_blocked
  FROM public.parent_food_blocks pfc
  WHERE pfc.parent_user_id = auth.uid()
    AND pfc.student_user_id = p_student_user_id;

  SELECT daily_limit, weekly_limit, monthly_limit
  INTO v_daily_limit, v_weekly_limit, v_monthly_limit
  FROM public.student_spending_limits
  WHERE student_user_id = p_student_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'today_spent', v_today_spent,
    'month_spent', v_month_spent,
    'today_orders', v_today_orders,
    'month_orders', v_month_orders,
    'today_calories', v_calories,
    'today_protein_g', v_protein,
    'today_fiber_g', v_fiber,
    'points', v_points,
    'favorites', v_favorites,
    'unread_alerts', v_unread_alerts,
    'blocked_foods', v_blocked,
    'daily_limit', v_daily_limit,
    'weekly_limit', v_weekly_limit,
    'monthly_limit', v_monthly_limit,
    'updated_at', now()
  );
END;
$function$;

grant execute on function public.get_parent_family_dashboard(uuid) to authenticated;
