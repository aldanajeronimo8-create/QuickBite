-- Phase 4: intelligent admin dashboard analytics.
-- The dashboard reads this RPC instead of exposing raw aggregate queries to the client.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_intelligence(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH paid_orders AS (
    SELECT o.id, o.created_at, o.total
    FROM public.orders o
    WHERE o.payment_status = 'confirmed'
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.created_at >= NOW() - make_interval(days => v_days)
  ),
  product_sales AS (
    SELECT oi.product_id,
           SUM(oi.quantity)::integer AS units_sold,
           SUM(oi.quantity * oi.price)::numeric(12,2) AS revenue
    FROM public.order_items oi
    JOIN paid_orders po ON po.id = oi.order_id
    GROUP BY oi.product_id
  ),
  movement_sales AS (
    SELECT im.product_id,
           COALESCE(SUM(CASE WHEN im.movement_type = 'entry' THEN im.quantity ELSE 0 END), 0)::integer AS recorded_entries
    FROM public.inventory_movements im
    WHERE im.created_at >= NOW() - make_interval(days => v_days)
    GROUP BY im.product_id
  ),
  product_metrics AS (
    SELECT p.id,
           p.name,
           p.stock,
           p.available,
           COALESCE(ps.units_sold, 0)::integer AS units_sold,
           COALESCE(ps.revenue, 0)::numeric(12,2) AS revenue,
           COALESCE(ms.recorded_entries, 0)::integer AS recorded_entries
    FROM public.products p
    LEFT JOIN product_sales ps ON ps.product_id = p.id
    LEFT JOIN movement_sales ms ON ms.product_id = p.id
  ),
  ranked AS (
    SELECT * FROM product_metrics
    ORDER BY units_sold DESC, revenue DESC
    LIMIT 8
  ),
  risk AS (
    SELECT pm.*,
           ROUND(pm.units_sold::numeric / GREATEST(v_days, 1), 2) AS avg_daily_units,
           CASE
             WHEN pm.available = false THEN 'hidden'
             WHEN pm.stock = 0 THEN 'critical'
             WHEN pm.units_sold >= 10
               AND pm.stock <= GREATEST(3, CEIL(pm.units_sold::numeric / GREATEST(v_days, 1) * 3)) THEN 'high'
             WHEN pm.stock <= 5 THEN 'medium'
             ELSE 'low'
           END AS risk_level
    FROM product_metrics pm
  ),
  daily AS (
    SELECT (po.created_at AT TIME ZONE 'America/Bogota')::date AS day,
           COUNT(*)::integer AS orders,
           SUM(po.total)::numeric(12,2) AS revenue
    FROM paid_orders po
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 14
  ),
  movement_summary AS (
    SELECT im.movement_type,
           SUM(im.quantity)::integer AS quantity
    FROM public.inventory_movements im
    WHERE im.created_at >= NOW() - make_interval(days => v_days)
    GROUP BY im.movement_type
    ORDER BY quantity DESC
  ),
  summary AS (
    SELECT COUNT(*)::integer AS paid_orders,
           COALESCE(SUM(total), 0)::numeric(12,2) AS revenue,
           COALESCE(AVG(total), 0)::numeric(12,2) AS avg_ticket
    FROM paid_orders
  )
  SELECT jsonb_build_object(
    'period_days', v_days,
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'top_products', COALESCE((SELECT jsonb_agg(to_jsonb(ranked) ORDER BY units_sold DESC, revenue DESC) FROM ranked), '[]'::jsonb),
    'stock_risk', COALESCE((SELECT jsonb_agg(to_jsonb(risk) ORDER BY CASE risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, units_sold DESC) FROM risk WHERE risk_level IN ('critical', 'high', 'medium')), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily) ORDER BY day DESC) FROM daily), '[]'::jsonb),
    'movement_summary', COALESCE((SELECT jsonb_agg(to_jsonb(movement_summary) ORDER BY quantity DESC) FROM movement_summary), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
