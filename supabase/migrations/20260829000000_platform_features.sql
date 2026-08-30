-- QuickBite platform expansion: ordering UX, automation, analytics and resilience.
-- All sensitive writes remain behind authenticated/RLS boundaries.

CREATE TABLE IF NOT EXISTS public.pickup_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_orders INTEGER CHECK (max_orders IS NULL OR max_orders > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_slot_id UUID REFERENCES public.pickup_slots(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS student_comment TEXT;

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('info','order','inventory','system','promotion')),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_stock_settings (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  minimum_stock INTEGER NOT NULL DEFAULT 5 CHECK (minimum_stock >= 0),
  reorder_quantity INTEGER NOT NULL DEFAULT 10 CHECK (reorder_quantity > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('low_stock','out_of_stock','demand_spike','backup_failed','job_failed','system')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_summaries (
  business_date DATE PRIMARY KEY,
  orders_count INTEGER NOT NULL DEFAULT 0,
  delivered_orders_count INTEGER NOT NULL DEFAULT 0,
  sales_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  items_sold INTEGER NOT NULL DEFAULT 0,
  average_ticket NUMERIC(12,2) NOT NULL DEFAULT 0,
  top_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  low_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  critical_stock_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin','administrator','cafeteria','finance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.demand_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  source TEXT NOT NULL DEFAULT 'order' CHECK (source IN ('order','manual','snapshot'))
);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for ON public.orders(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pickup_slot ON public.orders(pickup_slot_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_favorites_product ON public.favorites(product_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved ON public.system_alerts(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demand_product_time ON public.demand_observations(product_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_key_time ON public.automation_jobs(job_key, started_at DESC);

-- Extend order lifecycle while retaining backwards compatibility.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled'));

ALTER TABLE public.pickup_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pickup_slots_read ON public.pickup_slots;
CREATE POLICY pickup_slots_read ON public.pickup_slots FOR SELECT TO anon, authenticated USING (enabled = true OR public.is_admin());
DROP POLICY IF EXISTS pickup_slots_admin_write ON public.pickup_slots;
CREATE POLICY pickup_slots_admin_write ON public.pickup_slots FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS favorites_own_all ON public.favorites;
CREATE POLICY favorites_own_all ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_own_select ON public.notifications;
CREATE POLICY notifications_own_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_admin_all ON public.notifications;
CREATE POLICY notifications_admin_all ON public.notifications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS stock_settings_admin_all ON public.product_stock_settings;
CREATE POLICY stock_settings_admin_all ON public.product_stock_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS alerts_admin_all ON public.system_alerts;
CREATE POLICY alerts_admin_all ON public.system_alerts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS summaries_admin_read ON public.daily_summaries;
CREATE POLICY summaries_admin_read ON public.daily_summaries FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS summaries_admin_write ON public.daily_summaries;
CREATE POLICY summaries_admin_write ON public.daily_summaries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS staff_roles_admin_all ON public.staff_roles;
CREATE POLICY staff_roles_admin_all ON public.staff_roles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS demand_admin_read ON public.demand_observations;
CREATE POLICY demand_admin_read ON public.demand_observations FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS demand_admin_write ON public.demand_observations;
CREATE POLICY demand_admin_write ON public.demand_observations FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS jobs_admin_all ON public.automation_jobs;
CREATE POLICY jobs_admin_all ON public.automation_jobs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Atomic status transitions prevent invalid jumps from the client.
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF p_status NOT IN ('pending','confirmed','preparing','ready','delivered','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF v_current = 'delivered' AND p_status <> 'delivered' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  IF v_current = 'cancelled' AND p_status <> 'cancelled' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE public.orders SET status = p_status,
    ready_at = CASE WHEN p_status = 'ready' THEN COALESCE(ready_at, NOW()) ELSE ready_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_status(UUID,TEXT) TO authenticated;

-- Product availability is derived from stock as a safety net. Manual disabling remains supported.
CREATE OR REPLACE FUNCTION public.enforce_product_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock = 0 THEN NEW.available := false;
  ELSIF OLD.stock = 0 AND NEW.stock > 0 THEN NEW.available := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_enforce_availability ON public.products;
CREATE TRIGGER products_enforce_availability BEFORE UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_product_availability();

-- Useful analytics view for the Admin dashboard. security_invoker preserves RLS.
DROP VIEW IF EXISTS public.admin_sales_daily;
CREATE VIEW public.admin_sales_daily WITH (security_invoker = true) AS
SELECT DATE_TRUNC('day', created_at)::date AS business_date,
       COUNT(*)::integer AS orders_count,
       COALESCE(SUM(total),0)::numeric AS sales_total,
       COALESCE(AVG(total),0)::numeric AS average_ticket
FROM public.orders
WHERE payment_status = 'confirmed' AND status <> 'cancelled'
GROUP BY 1
ORDER BY 1 DESC;
