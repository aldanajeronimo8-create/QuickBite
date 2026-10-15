-- Keep legacy RPCs and direct updates from introducing custom recess labels.
ALTER TABLE public.recess_schedules
  DROP CONSTRAINT IF EXISTS recess_schedules_allowed_name_check;
ALTER TABLE public.recess_schedules
  ADD CONSTRAINT recess_schedules_allowed_name_check
  CHECK (name IN ('Primer Descanso', 'Segundo Descanso'));
