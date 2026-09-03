-- Keep production schema aligned with the order-window migration.
-- Editing a pickup window fires pickup_slots_touch_updated_at, so updated_at
-- must exist on pickup_slots in every environment.

ALTER TABLE public.pickup_slots
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS pickup_slots_touch_updated_at ON public.pickup_slots;
CREATE TRIGGER pickup_slots_touch_updated_at
BEFORE UPDATE ON public.pickup_slots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
