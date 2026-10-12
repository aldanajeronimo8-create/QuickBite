-- Close direct browser writes that bypass QuickBite's guarded order/payment RPCs.
-- Orders may only be updated directly for user-authored notes/comments; operational
-- state, payment state, price/total, owner, visibility and timestamps use guarded RPCs.
BEGIN;

-- Prevent account-enumeration probes from browser clients.
REVOKE EXECUTE ON FUNCTION public.login_email_exists(text) FROM PUBLIC, anon, authenticated;

-- Remove every table-level and column-level UPDATE grant from browser roles.
-- This also cleans up any historic column grants, not merely the table grant.
REVOKE UPDATE ON TABLE public.orders FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_column text;
BEGIN
  FOR v_column IN
    SELECT a.attname
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.orders'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.orders FROM PUBLIC, anon, authenticated',
      v_column
    );
  END LOOP;
END
$$;

-- RLS still limits which own/linked-parent rows can be updated.
-- Column privileges additionally prevent those rows' business fields being changed.
GRANT UPDATE (notes, student_comment) ON TABLE public.orders TO authenticated;

-- This SECURITY DEFINER RPC independently validates auth.uid() and is_admin().
-- The application previously fell back to direct table updates when this grant was absent.
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text) TO authenticated;

-- Fail the migration if the direct-write boundary was not actually applied.
DO $$
DECLARE
  v_column text;
BEGIN
  IF has_table_privilege('authenticated', 'public.orders', 'UPDATE') THEN
    RAISE EXCEPTION 'security boundary failed: authenticated still has table-level UPDATE on public.orders';
  END IF;

  FOREACH v_column IN ARRAY ARRAY[
    'id', 'user_id', 'total', 'status', 'payment_status', 'payment_method',
    'payment_reference', 'pickup_code', 'estimated_minutes', 'created_at',
    'updated_at', 'admin_hidden', 'ready_at', 'delivered_at', 'cancelled_at',
    'cancellation_reason', 'client_request_id', 'pickup_slot_id', 'scheduled_for'
  ]
  LOOP
    IF has_column_privilege('authenticated', 'public.orders', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'security boundary failed: authenticated can UPDATE public.orders.%', v_column;
    END IF;
  END LOOP;

  IF NOT has_column_privilege('authenticated', 'public.orders', 'notes', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.orders', 'student_comment', 'UPDATE') THEN
    RAISE EXCEPTION 'security boundary failed: note/comment-only updates are not granted';
  END IF;

  IF has_function_privilege('anon', 'public.login_email_exists(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.login_email_exists(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'security boundary failed: login_email_exists remains callable by browser roles';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.admin_update_order_status(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'security boundary failed: admin_update_order_status is not executable by authenticated clients';
  END IF;
END
$$;

COMMIT;
