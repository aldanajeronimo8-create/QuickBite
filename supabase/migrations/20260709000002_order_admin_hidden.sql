ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_admin_hidden_created_at
  ON public.orders(admin_hidden, created_at DESC);
