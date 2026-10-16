BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

CREATE TEMP TABLE qb_recess_test_state (
  admin_id uuid,
  section_id uuid,
  student_a uuid,
  student_b uuid,
  student_c uuid,
  product_id uuid,
  capacity_schedule_id uuid,
  crud_section_id uuid,
  crud_day integer,
  crud_schedule_ids uuid[],
  crud_delete_result text,
  history_delete_result text
);

DO $setup$
DECLARE
  v_admin uuid;
  v_section uuid;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_product uuid;
  v_capacity_schedule uuid;
  v_crud_section uuid;
  v_crud_day integer;
  v_now timestamp := now() AT TIME ZONE 'America/Bogota';
  v_today_dow integer := extract(dow FROM (now() AT TIME ZONE 'America/Bogota'))::integer;
BEGIN
  SELECT id INTO v_admin
  FROM public.profiles
  WHERE role = 'admin' AND active
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No active admin fixture is available'; END IF;

  SELECT sec.id INTO v_section
  FROM public.academic_sections sec
  WHERE sec.active
    AND NOT EXISTS (
      SELECT 1
      FROM public.recess_schedules rs
      JOIN public.recess_schedule_targets rt ON rt.recess_schedule_id = rs.id
      WHERE rs.active AND rs.weekday = v_today_dow
        AND rt.section_id = sec.id AND rt.grade_id IS NULL AND rt.course_id IS NULL
    )
  ORDER BY sec.display_order, sec.id
  LIMIT 1;
  IF v_section IS NULL THEN RAISE EXCEPTION 'No active section without a schedule today is available'; END IF;

  SELECT sec.id, d.day INTO v_crud_section, v_crud_day
  FROM public.academic_sections sec
  CROSS JOIN generate_series(0, 6) AS d(day)
  WHERE sec.active
    AND NOT EXISTS (
      SELECT 1
      FROM public.recess_schedules rs
      JOIN public.recess_schedule_targets rt ON rt.recess_schedule_id = rs.id
      WHERE rs.active AND rs.weekday = d.day
        AND rt.section_id = sec.id AND rt.grade_id IS NULL AND rt.course_id IS NULL
    )
  ORDER BY sec.display_order, d.day
  LIMIT 1;
  IF v_crud_section IS NULL THEN RAISE EXCEPTION 'No free section/day for CRUD fixture is available'; END IF;

  INSERT INTO auth.users(id, email, created_at, updated_at)
  VALUES
    (v_a, 'qb-recess-a-' || replace(v_a::text, '-', '') || '@example.invalid', now(), now()),
    (v_b, 'qb-recess-b-' || replace(v_b::text, '-', '') || '@example.invalid', now(), now()),
    (v_c, 'qb-recess-c-' || replace(v_c::text, '-', '') || '@example.invalid', now(), now());

  INSERT INTO public.profiles(id, email, full_name, role, section_id, active)
  VALUES
    (v_a, 'qb-recess-a-' || replace(v_a::text, '-', '') || '@example.invalid', 'QB Recess Test A', 'student', v_section, true),
    (v_b, 'qb-recess-b-' || replace(v_b::text, '-', '') || '@example.invalid', 'QB Recess Test B', 'student', v_section, true),
    (v_c, 'qb-recess-c-' || replace(v_c::text, '-', '') || '@example.invalid', 'QB Recess Test C', 'student', v_section, true);

  INSERT INTO public.products(name, description, price, stock, available)
  VALUES ('QB Recess Test Product ' || substr(v_a::text, 1, 8), 'Transaction-only test fixture', 1, 100, true)
  RETURNING id INTO v_product;

  INSERT INTO public.recess_schedules(name, weekday, start_time, end_time, active, priority, max_students)
  VALUES (
    'Primer Descanso',
    v_today_dow,
    (v_now::time - interval '2 minutes')::time,
    (v_now::time + interval '20 minutes')::time,
    true, 0, 2
  )
  RETURNING id INTO v_capacity_schedule;

  INSERT INTO public.recess_schedule_targets(recess_schedule_id, section_id, grade_id, course_id)
  VALUES (v_capacity_schedule, v_section, NULL, NULL);

  INSERT INTO pg_temp.qb_recess_test_state(
    admin_id, section_id, student_a, student_b, student_c, product_id,
    capacity_schedule_id, crud_section_id, crud_day
  )
  VALUES (
    v_admin, v_section, v_a, v_b, v_c, v_product,
    v_capacity_schedule, v_crud_section, v_crud_day
  );
END;
$setup$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recess_schedules' AND column_name = 'max_students'
  ),
  'recess_schedules exposes the configurable student capacity'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recess_schedules'::regclass
      AND conname = 'recess_schedules_max_students_check'
  ),
  'capacity is null or a positive integer'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_save_weekly_recess_schedule(text,integer[],time without time zone,time without time zone,uuid,integer,uuid[])', 'EXECUTE'),
  'anonymous callers cannot save weekly schedules'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_delete_recess_schedule_group(uuid[])', 'EXECUTE'),
  'anonymous callers cannot delete schedules'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.admin_save_weekly_recess_schedule(text,integer[],time without time zone,time without time zone,uuid,integer,uuid[])', 'EXECUTE'),
  'authenticated callers can reach the save RPC, which enforces admin authorization internally'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.admin_delete_recess_schedule_group(uuid[])', 'EXECUTE'),
  'authenticated callers can reach the delete RPC, which enforces admin authorization internally'
);

SELECT set_config('request.jwt.claim.sub', (SELECT student_a::text FROM pg_temp.qb_recess_test_state), true);
SELECT lives_ok(
  $$SELECT public.create_order_with_recess_tx(
    (SELECT student_a FROM pg_temp.qb_recess_test_state),
    'cash', 'pending', 'pending', 'QBTESTA1', 5, 'QB-ROLLBACK-TEST',
    jsonb_build_array(jsonb_build_object('product_id', (SELECT product_id FROM pg_temp.qb_recess_test_state), 'quantity', 1)),
    NULL::text, gen_random_uuid(),
    (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state),
    (now() AT TIME ZONE 'America/Bogota')::date
  )$$,
  'first order from student A fits in the cap'
);
SELECT set_config('request.jwt.claim.sub', (SELECT student_a::text FROM pg_temp.qb_recess_test_state), true);
SELECT lives_ok(
  $$SELECT public.create_order_with_recess_tx(
    (SELECT student_a FROM pg_temp.qb_recess_test_state),
    'cash', 'pending', 'pending', 'QBTESTA2', 5, 'QB-ROLLBACK-TEST',
    jsonb_build_array(jsonb_build_object('product_id', (SELECT product_id FROM pg_temp.qb_recess_test_state), 'quantity', 1)),
    NULL::text, gen_random_uuid(),
    (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state),
    (now() AT TIME ZONE 'America/Bogota')::date
  )$$,
  'the same student can place another order without consuming a second student slot'
);
SELECT set_config('request.jwt.claim.sub', (SELECT student_b::text FROM pg_temp.qb_recess_test_state), true);
SELECT lives_ok(
  $$SELECT public.create_order_with_recess_tx(
    (SELECT student_b FROM pg_temp.qb_recess_test_state),
    'cash', 'pending', 'pending', 'QBTESTB1', 5, 'QB-ROLLBACK-TEST',
    jsonb_build_array(jsonb_build_object('product_id', (SELECT product_id FROM pg_temp.qb_recess_test_state), 'quantity', 1)),
    NULL::text, gen_random_uuid(),
    (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state),
    (now() AT TIME ZONE 'America/Bogota')::date
  )$$,
  'a second distinct student can fill the remaining slot'
);
SELECT results_eq(
  $$SELECT count(DISTINCT user_id) FROM public.orders
    WHERE scheduled_recess_schedule_id = (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state)
      AND status NOT IN ('cancelled', 'rejected')
      AND payment_status IS DISTINCT FROM 'rejected'
      AND (scheduled_for AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date$$,
  $$VALUES (2::bigint)$$,
  'capacity counts two distinct students rather than three orders'
);
SELECT set_config('request.jwt.claim.sub', (SELECT student_a::text FROM pg_temp.qb_recess_test_state), true);
SELECT results_eq(
  $$SELECT can_order FROM public.get_student_preorder_options()
    WHERE recess_schedule_id = (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state)$$,
  $$VALUES (true)$$,
  'a student already counted against capacity can make another order'
);
SELECT set_config('request.jwt.claim.sub', (SELECT student_c::text FROM pg_temp.qb_recess_test_state), true);
SELECT throws_ok(
  $$SELECT public.create_order_with_recess_tx(
    (SELECT student_c FROM pg_temp.qb_recess_test_state),
    'cash', 'pending', 'pending', 'QBTESTC1', 5, 'QB-ROLLBACK-TEST',
    jsonb_build_array(jsonb_build_object('product_id', (SELECT product_id FROM pg_temp.qb_recess_test_state), 'quantity', 1)),
    NULL::text, gen_random_uuid(),
    (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state),
    (now() AT TIME ZONE 'America/Bogota')::date
  )$$,
  'P0001',
  'recess_student_limit_reached',
  'the server rejects a third distinct student after the cap is full'
);
SELECT results_eq(
  $$SELECT can_order FROM public.get_student_preorder_options()
    WHERE recess_schedule_id = (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state)$$,
  $$VALUES (false)$$,
  'the student-facing options mark the full recess unavailable to a new student'
);

SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM pg_temp.qb_recess_test_state), true);
UPDATE pg_temp.qb_recess_test_state
SET crud_schedule_ids = public.admin_save_weekly_recess_schedule(
  'Primer Descanso',
  ARRAY[crud_day],
  time '00:10',
  time '00:20',
  crud_section_id,
  3,
  ARRAY[]::uuid[]
);
SELECT ok(
  cardinality(crud_schedule_ids) = 1
  AND EXISTS (
    SELECT 1 FROM public.recess_schedules
    WHERE id = (SELECT crud_schedule_ids[1] FROM pg_temp.qb_recess_test_state)
      AND max_students = 3 AND active
  ),
  'the save RPC creates the selected schedule with its capacity'
)
FROM pg_temp.qb_recess_test_state;
UPDATE pg_temp.qb_recess_test_state
SET crud_schedule_ids = public.admin_save_weekly_recess_schedule(
  'Primer Descanso',
  ARRAY[crud_day],
  time '00:15',
  time '00:30',
  crud_section_id,
  4,
  crud_schedule_ids
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.recess_schedules
    WHERE id = (SELECT crud_schedule_ids[1] FROM pg_temp.qb_recess_test_state)
      AND start_time = time '00:15'
      AND end_time = time '00:30'
      AND max_students = 4
      AND active
  ),
  'the edit RPC updates time and capacity without replacing the schedule id'
)
FROM pg_temp.qb_recess_test_state;
UPDATE pg_temp.qb_recess_test_state
SET crud_delete_result = public.admin_delete_recess_schedule_group(crud_schedule_ids);
SELECT is(
  (SELECT crud_delete_result FROM pg_temp.qb_recess_test_state),
  'deleted',
  'delete RPC permanently deletes a schedule without order history'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.recess_schedules
    WHERE id = (SELECT crud_schedule_ids[1] FROM pg_temp.qb_recess_test_state)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.recess_schedule_targets
    WHERE recess_schedule_id = (SELECT crud_schedule_ids[1] FROM pg_temp.qb_recess_test_state)
  ),
  'permanent deletion removes the schedule and its target rows'
);
UPDATE pg_temp.qb_recess_test_state
SET history_delete_result = public.admin_delete_recess_schedule_group(ARRAY[capacity_schedule_id]);
SELECT is(
  (SELECT history_delete_result FROM pg_temp.qb_recess_test_state),
  'archived',
  'delete RPC archives a schedule that already has orders'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.recess_schedules
    WHERE id = (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state)
      AND active = false
  )
  AND (
    SELECT count(*) FROM public.orders
    WHERE scheduled_recess_schedule_id = (SELECT capacity_schedule_id FROM pg_temp.qb_recess_test_state)
  ) = 3,
  'archiving preserves the existing schedule and all three orders'
);

SELECT * FROM finish();
ROLLBACK;
