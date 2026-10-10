-- Keep bulk test-period resets from generating one audit event and admin notification per row.
-- The reset writes one aggregate audit event after the operational state is cleared.

CREATE OR REPLACE FUNCTION public.audit_business_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_action TEXT;
  v_module TEXT;
  v_operation TEXT;
  v_entity_type TEXT := TG_TABLE_NAME;
  v_entity_id TEXT;
  v_details JSONB;
BEGIN
  IF current_setting('quickbite.skip_business_audit', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN v_entity_id := OLD.id::text;
  ELSE v_entity_id := NEW.id::text;
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'INSERT' THEN
      v_action := 'product.create'; v_module := 'catalog'; v_operation := 'create';
      v_details := jsonb_build_object('name', NEW.name, 'stock', NEW.stock, 'available', NEW.available);
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'product.delete'; v_module := 'catalog'; v_operation := 'delete';
      v_details := jsonb_build_object('name', OLD.name, 'stock', OLD.stock);
    ELSIF OLD.stock IS DISTINCT FROM NEW.stock THEN
      v_action := 'inventory.update'; v_module := 'inventory'; v_operation := 'adjust';
      v_details := jsonb_build_object('product_name', NEW.name, 'previous_stock', OLD.stock, 'stock', NEW.stock, 'delta', NEW.stock - OLD.stock);
    ELSE
      v_action := 'product.update'; v_module := 'catalog'; v_operation := 'update';
      v_details := jsonb_build_object('name', NEW.name, 'price', NEW.price, 'available', NEW.available);
    END IF;
  ELSIF TG_TABLE_NAME = 'categories' THEN
    v_action := 'category.' || lower(TG_OP); v_module := 'catalog'; v_operation := lower(TG_OP);
    IF TG_OP = 'DELETE' THEN v_details := jsonb_build_object('name', OLD.name);
    ELSE v_details := jsonb_build_object('name', NEW.name);
    END IF;
  ELSIF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP = 'INSERT' THEN
      v_action := 'order.create'; v_module := 'orders'; v_operation := 'create';
      v_details := jsonb_build_object('order_number', NEW.order_number, 'total', NEW.total, 'status', NEW.status, 'payment_status', NEW.payment_status, 'payment_method', NEW.payment_method);
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'order.delete'; v_module := 'orders'; v_operation := 'delete';
      v_details := jsonb_build_object('order_number', OLD.order_number, 'total', OLD.total);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'order.status_change'; v_module := 'orders'; v_operation := 'status_change';
      v_details := jsonb_build_object('order_number', NEW.order_number, 'from', OLD.status, 'to', NEW.status);
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      v_action := 'payment.update'; v_module := 'payments'; v_operation := 'status_change';
      v_details := jsonb_build_object('order_number', NEW.order_number, 'from', OLD.payment_status, 'to', NEW.payment_status);
    ELSIF OLD.admin_hidden IS DISTINCT FROM NEW.admin_hidden THEN
      v_action := 'order.archive'; v_module := 'sales';
      v_operation := CASE WHEN NEW.admin_hidden THEN 'close_period' ELSE 'restore_period' END;
      v_details := jsonb_build_object('order_number', NEW.order_number, 'hidden', NEW.admin_hidden);
    ELSE
      v_action := 'order.update'; v_module := 'orders'; v_operation := 'update';
      v_details := jsonb_build_object('order_number', NEW.order_number);
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_action := 'user.' || lower(TG_OP); v_module := 'users'; v_operation := lower(TG_OP);
    IF TG_OP = 'DELETE' THEN v_details := jsonb_build_object('role', OLD.role);
    ELSE v_details := jsonb_build_object('role', NEW.role);
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  PERFORM public.record_system_audit(v_actor_id, v_action, v_module, v_operation, v_entity_type, v_entity_id, 'success', v_details);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_order_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Bulk reset: suppress row-by-row audit fanout, then record one aggregate event.
  PERFORM set_config('quickbite.skip_business_audit', 'on', true);
  SELECT COUNT(*)::integer INTO v_order_count FROM public.orders;

  WITH consumed AS (
    SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL AND o.payment_status IS DISTINCT FROM 'rejected'
    GROUP BY oi.product_id
  )
  UPDATE public.products p SET stock = p.stock + c.quantity, updated_at = now()
  FROM consumed c WHERE p.id = c.product_id;

  WITH redeemed_products AS (
    SELECT product_id, COUNT(*)::integer AS quantity FROM public.loyalty_redemptions
    WHERE product_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled' GROUP BY product_id
  )
  UPDATE public.products p SET stock = p.stock + r.quantity, updated_at = now()
  FROM redeemed_products r WHERE p.id = r.product_id;

  WITH redeemed_rewards AS (
    SELECT reward_id, COUNT(*)::integer AS quantity FROM public.loyalty_redemptions
    WHERE status IS DISTINCT FROM 'cancelled' GROUP BY reward_id
  )
  UPDATE public.loyalty_rewards lr SET stock = COALESCE(lr.stock, 0) + r.quantity, updated_at = now()
  FROM redeemed_rewards r WHERE lr.id = r.reward_id;

  IF to_regclass('public.notifications') IS NOT NULL THEN DELETE FROM public.notifications WHERE true; END IF;
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN DELETE FROM public.wallet_transactions WHERE true; END IF;
  IF to_regclass('public.wallet_topup_requests') IS NOT NULL THEN DELETE FROM public.wallet_topup_requests WHERE true; END IF;
  IF to_regclass('public.loyalty_point_ledger') IS NOT NULL THEN DELETE FROM public.loyalty_point_ledger WHERE true; END IF;
  IF to_regclass('public.loyalty_redemptions') IS NOT NULL THEN DELETE FROM public.loyalty_redemptions WHERE true; END IF;
  IF to_regclass('public.order_items') IS NOT NULL THEN DELETE FROM public.order_items WHERE true; END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN DELETE FROM public.orders WHERE true; END IF;

  IF to_regclass('public.wallet_accounts') IS NOT NULL THEN
    UPDATE public.wallet_accounts SET balance = 0, updated_at = now() WHERE true;
  END IF;
  IF to_regclass('public.report_periods') IS NOT NULL THEN DELETE FROM public.report_periods WHERE true; END IF;
  IF to_regclass('public.daily_summaries') IS NOT NULL THEN DELETE FROM public.daily_summaries WHERE true; END IF;
  IF to_regclass('public.demand_observations') IS NOT NULL THEN DELETE FROM public.demand_observations WHERE true; END IF;
  IF to_regclass('public.system_alerts') IS NOT NULL THEN DELETE FROM public.system_alerts WHERE true; END IF;
  IF to_regclass('public.automation_jobs') IS NOT NULL THEN DELETE FROM public.automation_jobs WHERE true; END IF;
  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN DELETE FROM public.sales_export_batches WHERE true; END IF;

  PERFORM public.record_system_audit(auth.uid(), 'test_period.reset', 'admin', 'reset_period',
    'system', 'test-period', 'success',
    jsonb_build_object('orders_reset', v_order_count, 'scope', 'operational_period'));
  RETURN v_order_count;
END;
$function$;
