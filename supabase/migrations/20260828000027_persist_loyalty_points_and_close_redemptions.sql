-- Keep earned loyalty points independent from the operational order period.
-- Closing a period may remove orders, but it must not erase a student's balance.

CREATE TABLE IF NOT EXISTS public.loyalty_point_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  source TEXT NOT NULL DEFAULT 'order' CHECK (source = 'order'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_point_ledger_order_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_point_ledger_user_created
  ON public.loyalty_point_ledger(user_id, created_at DESC);

ALTER TABLE public.loyalty_point_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_point_ledger FROM anon, authenticated;
GRANT SELECT ON public.loyalty_point_ledger TO authenticated;

DROP POLICY IF EXISTS loyalty_point_ledger_select_own_or_admin ON public.loyalty_point_ledger;
CREATE POLICY loyalty_point_ledger_select_own_or_admin
  ON public.loyalty_point_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

ALTER TABLE public.loyalty_point_ledger REPLICA IDENTITY FULL;

-- Backfill points for every already-confirmed order before the order period is
-- closed. The unique order key makes this safe to run more than once.
INSERT INTO public.loyalty_point_ledger (user_id, order_id, points, source)
SELECT o.user_id,
       o.id,
       FLOOR(o.total / NULLIF(s.points_per_currency_unit, 0))::INTEGER,
       'order'
FROM public.orders AS o
CROSS JOIN public.loyalty_settings AS s
WHERE o.user_id IS NOT NULL
  AND o.payment_status = 'confirmed'
  AND o.total > 0
  AND s.id = TRUE
  AND FLOOR(o.total / NULLIF(s.points_per_currency_unit, 0)) > 0
ON CONFLICT (order_id) DO UPDATE
SET points = EXCLUDED.points;

CREATE OR REPLACE FUNCTION public.sync_loyalty_points_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_points INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.payment_status = 'confirmed'
     AND NEW.payment_status IS DISTINCT FROM 'confirmed' THEN
    DELETE FROM public.loyalty_point_ledger WHERE order_id = OLD.id;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR NEW.payment_status <> 'confirmed' OR NEW.total <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT FLOOR(NEW.total / NULLIF(points_per_currency_unit, 0))::INTEGER
  INTO v_points
  FROM public.loyalty_settings
  WHERE id = TRUE;

  IF COALESCE(v_points, 0) <= 0 THEN
    DELETE FROM public.loyalty_point_ledger WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.loyalty_point_ledger (user_id, order_id, points, source)
  VALUES (NEW.user_id, NEW.id, v_points, 'order')
  ON CONFLICT (order_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      points = EXCLUDED.points;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_loyalty_points ON public.orders;
CREATE TRIGGER orders_sync_loyalty_points
AFTER INSERT OR UPDATE OF user_id, total, payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_loyalty_points_for_order();

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_reward_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_settings public.loyalty_settings%ROWTYPE;
  v_reward public.loyalty_rewards%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_redemption_id UUID;
  v_redemption_code TEXT;
  v_earned_points INTEGER;
  v_spent_points INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('student', 'both')
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_settings FROM public.loyalty_settings WHERE id = TRUE;
  IF v_settings.id IS NULL OR NOT v_settings.enabled THEN RAISE EXCEPTION 'loyalty_disabled'; END IF;

  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id AND active = TRUE FOR UPDATE;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'reward_not_found'; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_reward.product_id FOR UPDATE;
  IF v_product.id IS NULL OR NOT v_product.available OR v_product.stock <= 0 THEN RAISE EXCEPTION 'reward_out_of_stock'; END IF;

  SELECT COALESCE(SUM(points), 0)::INTEGER
  INTO v_earned_points
  FROM public.loyalty_point_ledger
  WHERE user_id = auth.uid();

  SELECT COALESCE(SUM(points_spent), 0)::INTEGER
  INTO v_spent_points
  FROM public.loyalty_redemptions
  WHERE user_id = auth.uid()
    AND status IN ('pending', 'approved', 'fulfilled', 'delivered');

  IF v_earned_points - v_spent_points < v_reward.points_required THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  v_redemption_code := 'RB-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

  INSERT INTO public.loyalty_redemptions (user_id, reward_id, product_id, points_spent, redemption_code, status)
  VALUES (auth.uid(), v_reward.id, v_product.id, v_reward.points_required, v_redemption_code, 'pending')
  RETURNING id INTO v_redemption_id;

  UPDATE public.products
  SET stock = stock - 1,
      available = CASE WHEN stock <= 1 THEN FALSE ELSE available END
  WHERE id = v_product.id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'reward_redemption', 'Canje enviado para aprobación',
    format('Solicitaste %s. El código se habilitará cuando el administrador apruebe el canje.', v_reward.title));

  RETURN jsonb_build_object(
    'id', v_redemption_id,
    'reward_id', v_reward.id,
    'points_spent', v_reward.points_required,
    'redemption_code', v_redemption_code,
    'status', 'pending',
    'created_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;

-- Canjes remain in the student's history and continue to count as spent points,
-- but are removed from the next operational admin period.
ALTER TABLE public.loyalty_redemptions
  ADD COLUMN IF NOT EXISTS admin_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_admin_hidden_created
  ON public.loyalty_redemptions(admin_hidden, created_at DESC);

-- The period reset is deliberately idempotent and uses explicit predicates for
-- every full-table operation, satisfying Supabase's safe-delete guard.
CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT COUNT(*)::INTEGER INTO v_order_count FROM public.orders;

  UPDATE public.loyalty_redemptions
  SET admin_hidden = TRUE
  WHERE admin_hidden IS DISTINCT FROM TRUE;

  DELETE FROM public.orders WHERE id IS NOT NULL;

  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    DELETE FROM public.sales_export_batches WHERE id IS NOT NULL;
  END IF;

  RETURN v_order_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'loyalty_point_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_point_ledger;
  END IF;
END;
$$;
