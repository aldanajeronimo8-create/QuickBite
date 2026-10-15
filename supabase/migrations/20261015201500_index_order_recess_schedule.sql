-- Cover the recess-schedule foreign key used by order joins and RESTRICT deletes.
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_recess_schedule_id
  ON public.orders (scheduled_recess_schedule_id);
