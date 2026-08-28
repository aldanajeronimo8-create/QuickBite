-- A sales close never deletes orders. It only marks the successfully exported
-- operational period, keeping the student order history intact.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_batch_id UUID;

-- Future sales retain the exact stock snapshot from the transaction that
-- discounted inventory. Existing rows stay NULL rather than fabricating data.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_before INTEGER,
  ADD COLUMN IF NOT EXISTS stock_after INTEGER;

CREATE OR REPLACE FUNCTION public.capture_order_item_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  SELECT stock INTO v_current_stock FROM public.products WHERE id = NEW.product_id;
  IF FOUND THEN
    NEW.stock_after := v_current_stock;
    NEW.stock_before := v_current_stock + NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_capture_stock ON public.order_items;
CREATE TRIGGER order_items_capture_stock
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.capture_order_item_stock();

CREATE INDEX IF NOT EXISTS idx_orders_active_payment_period
  ON public.orders (created_at DESC)
  WHERE exported_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_export_batch_id
  ON public.orders (export_batch_id);

CREATE TABLE IF NOT EXISTS public.sales_export_batches (
  id UUID PRIMARY KEY,
  order_ids JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  exported_count INTEGER NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.sales_export_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_export_batches FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_sales_export_batch
  ON public.sales_export_batches ((status)) WHERE status = 'pending';

-- The legacy destructive reset is intentionally no longer callable. Orders
-- are closed by marking their export batch instead of deleting them.
DO $$
BEGIN
  IF to_regprocedure('public.reset_all_orders()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reset_all_orders() FROM authenticated';
  END IF;
END;
$$;
