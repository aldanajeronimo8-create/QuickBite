BEGIN;

-- A real FIFO waitlist for capped recesses. A place is offered to one student
-- at a time and remains reserved for five minutes.
CREATE TABLE IF NOT EXISTS public.recess_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recess_schedule_id uuid NOT NULL REFERENCES public.recess_schedules(id) ON DELETE CASCADE,
  pickup_date date NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  UNIQUE (student_user_id, recess_schedule_id, pickup_date),
  CHECK (
    (status = 'offered' AND offer_expires_at IS NOT NULL)
    OR status <> 'offered'
  )
);

CREATE INDEX IF NOT EXISTS recess_waitlist_fifo_idx
  ON public.recess_waitlist(recess_schedule_id, pickup_date, status, created_at);

ALTER TABLE public.recess_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recess_waitlist_read_own ON public.recess_waitlist;
CREATE POLICY recess_waitlist_read_own
  ON public.recess_waitlist FOR SELECT TO authenticated
  USING (student_user_id = auth.uid() OR public.is_admin());
REVOKE ALL ON public.recess_waitlist FROM anon, authenticated;
GRANT SELECT ON public.recess_waitlist TO authenticated;

-- Promote the oldest waiting student when there is a free student slot.
-- Expired offers are skipped, and a slot is not offered after the recess ends.
CREATE OR REPLACE FUNCTION public.promote_recess_waitlist(
  p_recess_schedule_id uuid,
  p_pickup_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_schedule public.recess_schedules%ROWTYPE;
  v_students_count bigint := 0;
  v_next_id uuid;
  v_now timestamptz := now();
  v_local_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_local_time time := (now() AT TIME ZONE 'America/Bogota')::time;
BEGIN
  SELECT * INTO v_schedule
  FROM public.recess_schedules
  WHERE id = p_recess_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.recess_waitlist
  SET status = 'expired', updated_at = v_now, offer_expires_at = NULL
  WHERE recess_schedule_id = p_recess_schedule_id
    AND pickup_date = p_pickup_date
    AND status = 'offered'
    AND offer_expires_at <= v_now;

  IF p_pickup_date <> v_local_date
     OR v_schedule.weekday <> EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::integer
     OR NOT v_schedule.active
     OR v_local_time >= v_schedule.end_time THEN
    UPDATE public.recess_waitlist
    SET status = 'expired', updated_at = v_now, offer_expires_at = NULL
    WHERE recess_schedule_id = p_recess_schedule_id
      AND pickup_date = p_pickup_date
      AND status IN ('waiting', 'offered');
    RETURN;
  END IF;

  IF v_schedule.max_students IS NULL THEN
    UPDATE public.recess_waitlist
    SET status = 'expired', updated_at = v_now, offer_expires_at = NULL
    WHERE recess_schedule_id = p_recess_schedule_id
      AND pickup_date = p_pickup_date
      AND status IN ('waiting', 'offered');
    RETURN;
  END IF;

  SELECT count(DISTINCT o.user_id)
  INTO v_students_count
  FROM public.orders o
  WHERE o.scheduled_recess_schedule_id = p_recess_schedule_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status IS DISTINCT FROM 'rejected'
    AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = p_pickup_date;

  -- An administrator or another permitted system workflow may fill a slot;
  -- revoke the outstanding offer instead of letting capacity be exceeded.
  IF v_students_count >= v_schedule.max_students THEN
    UPDATE public.recess_waitlist
    SET status = 'expired', updated_at = v_now, offer_expires_at = NULL
    WHERE recess_schedule_id = p_recess_schedule_id
      AND pickup_date = p_pickup_date
      AND status = 'offered';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recess_waitlist
    WHERE recess_schedule_id = p_recess_schedule_id
      AND pickup_date = p_pickup_date
      AND status = 'offered'
      AND offer_expires_at > v_now
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_next_id
  FROM public.recess_waitlist
  WHERE recess_schedule_id = p_recess_schedule_id
    AND pickup_date = p_pickup_date
    AND status = 'waiting'
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF v_next_id IS NOT NULL THEN
    UPDATE public.recess_waitlist
    SET status = 'offered',
        offered_at = v_now,
        offer_expires_at = v_now + interval '5 minutes',
        updated_at = v_now
    WHERE id = v_next_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_recess_waitlist(uuid, date) FROM PUBLIC, anon, authenticated;

-- Keep offers current as orders are created, cancelled, rejected, or delivered.
CREATE OR REPLACE FUNCTION public.refresh_recess_waitlist_after_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_schedule_id uuid;
  v_pickup_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.scheduled_recess_schedule_id IS NOT NULL
       AND OLD.scheduled_for IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.recess_waitlist w
         WHERE w.recess_schedule_id = OLD.scheduled_recess_schedule_id
           AND w.pickup_date = (OLD.scheduled_for AT TIME ZONE 'America/Bogota')::date
           AND w.status IN ('waiting', 'offered')
       ) THEN
      PERFORM public.promote_recess_waitlist(
        OLD.scheduled_recess_schedule_id,
        (OLD.scheduled_for AT TIME ZONE 'America/Bogota')::date
      );
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.scheduled_recess_schedule_id IS NOT NULL AND NEW.scheduled_for IS NOT NULL THEN
    v_schedule_id := NEW.scheduled_recess_schedule_id;
    v_pickup_date := (NEW.scheduled_for AT TIME ZONE 'America/Bogota')::date;

    IF NEW.status NOT IN ('cancelled', 'rejected')
       AND NEW.payment_status IS DISTINCT FROM 'rejected' THEN
      UPDATE public.recess_waitlist
      SET status = 'accepted',
          offer_expires_at = NULL,
          updated_at = now()
      WHERE student_user_id = NEW.user_id
        AND recess_schedule_id = v_schedule_id
        AND pickup_date = v_pickup_date
        AND status = 'offered';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.recess_waitlist w
      WHERE w.recess_schedule_id = v_schedule_id
        AND w.pickup_date = v_pickup_date
        AND w.status IN ('waiting', 'offered')
    ) THEN
      PERFORM public.promote_recess_waitlist(v_schedule_id, v_pickup_date);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.scheduled_recess_schedule_id IS NOT NULL
     AND OLD.scheduled_for IS NOT NULL
     AND (
       OLD.scheduled_recess_schedule_id IS DISTINCT FROM NEW.scheduled_recess_schedule_id
       OR (OLD.scheduled_for AT TIME ZONE 'America/Bogota')::date
          IS DISTINCT FROM (NEW.scheduled_for AT TIME ZONE 'America/Bogota')::date
     ) THEN
    PERFORM public.promote_recess_waitlist(
      OLD.scheduled_recess_schedule_id,
      (OLD.scheduled_for AT TIME ZONE 'America/Bogota')::date
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_recess_waitlist_after_order_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refresh_recess_waitlist_after_order_change ON public.orders;
CREATE TRIGGER refresh_recess_waitlist_after_order_change
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.refresh_recess_waitlist_after_order_change();

-- Last-resort database guard: even if a client bypasses checkout validations,
-- a pending offer cannot be stolen by another distinct student.
CREATE OR REPLACE FUNCTION public.guard_recess_waitlist_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_max_students integer;
  v_students_count bigint := 0;
  v_student_already_counted boolean := false;
  v_student_has_offer boolean := false;
  v_offer_exists boolean := false;
  v_pickup_date date;
BEGIN
  IF NEW.scheduled_recess_schedule_id IS NULL OR NEW.scheduled_for IS NULL
     OR NEW.status IN ('cancelled', 'rejected')
     OR NEW.payment_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  v_pickup_date := (NEW.scheduled_for AT TIME ZONE 'America/Bogota')::date;
  SELECT max_students INTO v_max_students
  FROM public.recess_schedules
  WHERE id = NEW.scheduled_recess_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.recess_waitlist w
    WHERE w.recess_schedule_id = NEW.scheduled_recess_schedule_id
      AND w.pickup_date = v_pickup_date
      AND w.status IN ('waiting', 'offered')
  ) THEN
    PERFORM public.promote_recess_waitlist(
      NEW.scheduled_recess_schedule_id,
      v_pickup_date
    );
  END IF;
  IF v_max_students IS NULL THEN RETURN NEW; END IF;

  SELECT count(DISTINCT o.user_id),
         coalesce(bool_or(o.user_id = NEW.user_id), false)
  INTO v_students_count, v_student_already_counted
  FROM public.orders o
  WHERE o.scheduled_recess_schedule_id = NEW.scheduled_recess_schedule_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status IS DISTINCT FROM 'rejected'
    AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_pickup_date;

  SELECT coalesce(bool_or(w.student_user_id = NEW.user_id), false),
         coalesce(bool_or(w.student_user_id <> NEW.user_id), false)
  INTO v_student_has_offer, v_offer_exists
  FROM public.recess_waitlist w
  WHERE w.recess_schedule_id = NEW.scheduled_recess_schedule_id
    AND w.pickup_date = v_pickup_date
    AND w.status = 'offered'
    AND w.offer_expires_at > now();

  IF NOT v_student_already_counted AND v_offer_exists AND NOT v_student_has_offer THEN
    RAISE EXCEPTION 'recess_waitlist_offer_pending';
  END IF;

  IF NOT v_student_already_counted
     AND v_students_count >= v_max_students
     AND NOT v_student_has_offer THEN
    RAISE EXCEPTION 'recess_student_limit_reached';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_recess_waitlist_offer() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_recess_waitlist_offer ON public.orders;
CREATE TRIGGER guard_recess_waitlist_offer
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_recess_waitlist_offer();

-- The availability RPC is also the waitlist-status endpoint. It promotes
-- expired/free slots before returning the current offer and queue position.
DROP FUNCTION IF EXISTS public.get_student_preorder_options();
CREATE FUNCTION public.get_student_preorder_options()
RETURNS TABLE(
  recess_schedule_id uuid,
  name text,
  start_time time without time zone,
  end_time time without time zone,
  pickup_date date,
  preorders_count bigint,
  max_preorders integer,
  is_active boolean,
  can_order boolean,
  window_open boolean,
  waitlist_status text,
  waitlist_position bigint,
  offer_expires_at timestamptz,
  server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_student public.profiles%ROWTYPE;
  v_time time := (now() AT TIME ZONE 'America/Bogota')::time;
  v_date date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::integer;
  v_schedule public.recess_schedules%ROWTYPE;
  v_waitlist_needs_refresh boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = public.effective_student_user_id()
    AND role IN ('student', 'both');

  IF NOT FOUND THEN RAISE EXCEPTION 'student_only'; END IF;
  IF v_student.section_id IS NULL THEN RETURN; END IF;

  FOR v_schedule IN
    SELECT s.*
    FROM public.recess_schedules s
    JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
    WHERE s.active AND s.weekday = v_dow
      AND t.section_id = v_student.section_id
      AND t.grade_id IS NULL AND t.course_id IS NULL
  LOOP
    -- Avoid taking schedule-row locks on ordinary availability polls. Only
    -- enter the locking promotion path when a queue actually needs advancing.
    SELECT EXISTS (
      SELECT 1
      FROM public.recess_waitlist w
      WHERE w.recess_schedule_id = v_schedule.id
        AND w.pickup_date = v_date
        AND w.status IN ('waiting', 'offered')
    ) INTO v_waitlist_needs_refresh;

    IF v_waitlist_needs_refresh AND (
      v_time >= v_schedule.end_time
      OR v_schedule.max_students IS NULL
      OR EXISTS (
        SELECT 1 FROM public.recess_waitlist expired_offer
        WHERE expired_offer.recess_schedule_id = v_schedule.id
          AND expired_offer.pickup_date = v_date
          AND expired_offer.status = 'offered'
          AND expired_offer.offer_expires_at <= now()
      )
      OR EXISTS (
        SELECT 1 FROM public.recess_waitlist waiting
        WHERE waiting.recess_schedule_id = v_schedule.id
          AND waiting.pickup_date = v_date
          AND waiting.status = 'waiting'
      ) AND (
        SELECT count(DISTINCT o.user_id)
        FROM public.orders o
        WHERE o.scheduled_recess_schedule_id = v_schedule.id
          AND o.status NOT IN ('cancelled', 'rejected')
          AND o.payment_status IS DISTINCT FROM 'rejected'
          AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
      ) < v_schedule.max_students
      OR EXISTS (
        SELECT 1 FROM public.recess_waitlist active_offer
        WHERE active_offer.recess_schedule_id = v_schedule.id
          AND active_offer.pickup_date = v_date
          AND active_offer.status = 'offered'
          AND active_offer.offer_expires_at > now()
      ) AND (
        SELECT count(DISTINCT o.user_id)
        FROM public.orders o
        WHERE o.scheduled_recess_schedule_id = v_schedule.id
          AND o.status NOT IN ('cancelled', 'rejected')
          AND o.payment_status IS DISTINCT FROM 'rejected'
          AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
      ) >= v_schedule.max_students
    ) THEN
      PERFORM public.promote_recess_waitlist(v_schedule.id, v_date);
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.start_time,
         s.end_time,
         v_date,
         coalesce(counts.students_count, 0)::bigint,
         s.max_students,
         (v_time >= s.start_time AND v_time < s.end_time),
         (
           v_time < s.end_time
           AND (
             s.max_students IS NULL
             OR coalesce(counts.student_has_order, false)
             OR (
               wl.status = 'offered'
               AND wl.offer_expires_at > now()
             )
             OR (
               coalesce(counts.students_count, 0) < s.max_students
               AND NOT EXISTS (
                 SELECT 1 FROM public.recess_waitlist active_offer
                 WHERE active_offer.recess_schedule_id = s.id
                   AND active_offer.pickup_date = v_date
                   AND active_offer.status = 'offered'
                   AND active_offer.offer_expires_at > now()
               )
             )
           )
         ),
         (v_time < s.end_time),
         wl.status,
         CASE WHEN wl.status = 'waiting' THEN (
           SELECT count(*) + 1
           FROM public.recess_waitlist earlier
           WHERE earlier.recess_schedule_id = s.id
             AND earlier.pickup_date = v_date
             AND earlier.status = 'waiting'
             AND (earlier.created_at, earlier.id) < (wl.created_at, wl.id)
         ) ELSE NULL END,
         wl.offer_expires_at,
         now()
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT o.user_id)::bigint AS students_count,
           coalesce(bool_or(o.user_id = v_student.id), false) AS student_has_order
    FROM public.orders o
    WHERE o.scheduled_recess_schedule_id = s.id
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.payment_status IS DISTINCT FROM 'rejected'
      AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = v_date
  ) counts ON true
  LEFT JOIN LATERAL (
    SELECT w.status, w.created_at, w.offer_expires_at
    FROM public.recess_waitlist w
    WHERE w.student_user_id = v_student.id
      AND w.recess_schedule_id = s.id
      AND w.pickup_date = v_date
      AND w.status IN ('waiting', 'offered')
    ORDER BY w.created_at DESC
    LIMIT 1
  ) wl ON true
  WHERE s.active AND s.weekday = v_dow
    AND t.section_id = v_student.section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
  ORDER BY s.start_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_preorder_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_preorder_options() TO authenticated;

CREATE OR REPLACE FUNCTION public.join_student_recess_waitlist(
  p_recess_schedule_id uuid,
  p_pickup_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_student public.profiles%ROWTYPE;
  v_schedule public.recess_schedules%ROWTYPE;
  v_now_time time := (now() AT TIME ZONE 'America/Bogota')::time;
  v_today date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_dow integer := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::integer;
  v_students_count bigint := 0;
  v_student_has_order boolean := false;
  v_active_offer boolean := false;
  v_existing public.recess_waitlist%ROWTYPE;
  v_result public.recess_waitlist%ROWTYPE;
  v_position bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_pickup_date IS DISTINCT FROM v_today THEN RAISE EXCEPTION 'preorder_must_be_same_day'; END IF;

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = public.effective_student_user_id()
    AND role IN ('student', 'both')
    AND active = true;
  IF NOT FOUND OR v_student.section_id IS NULL THEN RAISE EXCEPTION 'student_only'; END IF;

  SELECT s.* INTO v_schedule
  FROM public.recess_schedules s
  JOIN public.recess_schedule_targets t ON t.recess_schedule_id = s.id
  WHERE s.id = p_recess_schedule_id
    AND s.active AND s.weekday = v_dow
    AND t.section_id = v_student.section_id
    AND t.grade_id IS NULL AND t.course_id IS NULL
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_recess_schedule_for_student'; END IF;
  IF v_now_time >= v_schedule.end_time THEN RAISE EXCEPTION 'recess_window_closed'; END IF;
  IF v_schedule.max_students IS NULL THEN RAISE EXCEPTION 'recess_capacity_unlimited'; END IF;

  PERFORM public.promote_recess_waitlist(p_recess_schedule_id, p_pickup_date);

  SELECT count(DISTINCT o.user_id),
         coalesce(bool_or(o.user_id = v_student.id), false)
  INTO v_students_count, v_student_has_order
  FROM public.orders o
  WHERE o.scheduled_recess_schedule_id = p_recess_schedule_id
    AND o.status NOT IN ('cancelled', 'rejected')
    AND o.payment_status IS DISTINCT FROM 'rejected'
    AND (o.scheduled_for AT TIME ZONE 'America/Bogota')::date = p_pickup_date;
  IF v_student_has_order THEN RAISE EXCEPTION 'student_already_has_recess_order'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.recess_waitlist w
    WHERE w.recess_schedule_id = p_recess_schedule_id
      AND w.pickup_date = p_pickup_date
      AND w.status = 'offered'
      AND w.offer_expires_at > now()
  ) INTO v_active_offer;

  IF v_students_count < v_schedule.max_students AND NOT v_active_offer THEN
    RAISE EXCEPTION 'recess_capacity_available';
  END IF;

  SELECT * INTO v_existing
  FROM public.recess_waitlist w
  WHERE w.student_user_id = v_student.id
    AND w.recess_schedule_id = p_recess_schedule_id
    AND w.pickup_date = p_pickup_date
  FOR UPDATE;

  IF FOUND AND (
    v_existing.status = 'waiting'
    OR (v_existing.status = 'offered' AND v_existing.offer_expires_at > now())
  ) THEN
    v_result := v_existing;
  ELSE
    INSERT INTO public.recess_waitlist(
      student_user_id, recess_schedule_id, pickup_date, status,
      created_at, updated_at, offered_at, offer_expires_at
    )
    VALUES (v_student.id, p_recess_schedule_id, p_pickup_date, 'waiting', now(), now(), NULL, NULL)
    ON CONFLICT (student_user_id, recess_schedule_id, pickup_date)
    DO UPDATE SET status = 'waiting', created_at = now(), updated_at = now(),
                  offered_at = NULL, offer_expires_at = NULL
    RETURNING * INTO v_result;
    PERFORM public.promote_recess_waitlist(p_recess_schedule_id, p_pickup_date);
    SELECT * INTO v_result FROM public.recess_waitlist WHERE id = v_result.id;
  END IF;

  IF v_result.status = 'waiting' THEN
    SELECT count(*) + 1 INTO v_position
    FROM public.recess_waitlist earlier
    WHERE earlier.recess_schedule_id = p_recess_schedule_id
      AND earlier.pickup_date = p_pickup_date
      AND earlier.status = 'waiting'
      AND (earlier.created_at, earlier.id) <= (v_result.created_at, v_result.id);
  ELSE
    v_position := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', v_result.status,
    'position', v_position,
    'offer_expires_at', v_result.offer_expires_at,
    'pickup_date', v_result.pickup_date
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.join_student_recess_waitlist(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_student_recess_waitlist(uuid, date) TO authenticated;

-- Enforce the scheduled pickup boundary at the database boundary. A student
-- device clock or a manually invoked admin RPC cannot deliver a preorder early.
CREATE OR REPLACE FUNCTION public.enforce_preordered_delivery_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NEW.status = 'delivered' AND NEW.preordered IS TRUE THEN
    IF NEW.scheduled_for IS NULL THEN
      RAISE EXCEPTION 'preordered_pickup_schedule_missing';
    END IF;
    IF now() < NEW.scheduled_for THEN
      RAISE EXCEPTION 'preordered_pickup_not_started';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_preordered_delivery_time() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_preordered_delivery_time ON public.orders;
CREATE TRIGGER enforce_preordered_delivery_time
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_preordered_delivery_time();

CREATE OR REPLACE FUNCTION public.leave_student_recess_waitlist(
  p_recess_schedule_id uuid,
  p_pickup_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_student_id uuid;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.id INTO v_student_id
  FROM public.profiles p
  WHERE p.id = public.effective_student_user_id()
    AND p.role IN ('student', 'both')
    AND p.active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'student_only'; END IF;

  UPDATE public.recess_waitlist
  SET status = 'cancelled', offer_expires_at = NULL, updated_at = now()
  WHERE student_user_id = v_student_id
    AND recess_schedule_id = p_recess_schedule_id
    AND pickup_date = p_pickup_date
    AND status IN ('waiting', 'offered');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM public.promote_recess_waitlist(p_recess_schedule_id, p_pickup_date);
  RETURN v_rows > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_student_recess_waitlist(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_student_recess_waitlist(uuid, date) TO authenticated;

COMMIT;
