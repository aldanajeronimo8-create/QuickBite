-- Gate the historical notification cleanup against an externally encrypted backup.
-- This RPC only removes admin_notifications rows whose recipient has no Auth account.
-- It preserves all notifications with an auth.users recipient and rolls back on any mismatch.

CREATE OR REPLACE FUNCTION public.admin_cleanup_orphan_admin_notifications(
  p_expected_count bigint,
  p_expected_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_total_before bigint;
  v_orphan_count bigint;
  v_actual_hash text;
  v_preserved_count bigint;
  v_inserted_count bigint;
  v_remaining_orphans bigint;
BEGIN
  IF p_expected_count IS NULL OR p_expected_count <= 0
     OR p_expected_sha256 IS NULL
     OR p_expected_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_cleanup_manifest';
  END IF;

  LOCK TABLE public.admin_notifications IN ACCESS EXCLUSIVE MODE;

  SELECT
    count(*)::bigint,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
      )
    )::bigint,
    encode(
      sha256(
        convert_to(
          COALESCE(
            string_agg(n.id::text || E'\n', '' ORDER BY n.id)
              FILTER (
                WHERE NOT EXISTS (
                  SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
                )
              ),
            ''
          ),
          'UTF8'
        )
      ),
      'hex'
    )
  INTO v_total_before, v_orphan_count, v_actual_hash
  FROM public.admin_notifications n;

  IF v_orphan_count <> p_expected_count
     OR v_actual_hash <> p_expected_sha256 THEN
    RAISE EXCEPTION 'orphan_notification_snapshot_mismatch: expected %, found %, hash_match %',
      p_expected_count, v_orphan_count, (v_actual_hash = p_expected_sha256);
  END IF;

  CREATE TEMP TABLE admin_notifications_to_keep ON COMMIT DROP AS
  SELECT
    n.id, n.admin_user_id, n.section, n.title, n.body,
    n.entity_type, n.entity_id, n.metadata, n.created_at, n.read_at
  FROM public.admin_notifications n
  WHERE EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
  );

  SELECT count(*)::bigint
    INTO v_preserved_count
  FROM pg_temp.admin_notifications_to_keep;

  IF v_total_before <> v_orphan_count + v_preserved_count THEN
    RAISE EXCEPTION 'notification_count_reconciliation_failed';
  END IF;

  TRUNCATE TABLE public.admin_notifications;

  INSERT INTO public.admin_notifications (
    id, admin_user_id, section, title, body, entity_type,
    entity_id, metadata, created_at, read_at
  )
  SELECT
    id, admin_user_id, section, title, body, entity_type,
    entity_id, metadata, created_at, read_at
  FROM pg_temp.admin_notifications_to_keep;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count <> v_preserved_count THEN
    RAISE EXCEPTION 'preserved_notification_count_mismatch: expected %, inserted %',
      v_preserved_count, v_inserted_count;
  END IF;

  SELECT count(*)::bigint
    INTO v_remaining_orphans
  FROM public.admin_notifications n
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
  );

  IF v_remaining_orphans <> 0 THEN
    RAISE EXCEPTION 'orphan_notifications_remain: %', v_remaining_orphans;
  END IF;

  RETURN jsonb_build_object(
    'status', 'verified',
    'notifications_removed', v_orphan_count,
    'notifications_preserved', v_preserved_count,
    'notifications_remaining_without_auth', v_remaining_orphans,
    'total_before', v_total_before,
    'total_after', v_inserted_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_cleanup_orphan_admin_notifications(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cleanup_orphan_admin_notifications(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_cleanup_orphan_admin_notifications(bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_orphan_admin_notifications(bigint, text) TO service_role;
