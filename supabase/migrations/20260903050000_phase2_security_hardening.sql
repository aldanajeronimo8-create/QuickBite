-- QuickBite Phase 2: least-privilege hardening without removing required Student/Parent/Admin RPCs.

-- 1) Public views must obey the caller's privileges/RLS.
ALTER VIEW public.product_inventory_status SET (security_invoker = true);
ALTER VIEW public.product_sales_rankings SET (security_invoker = true);

-- 2) Trigger/event functions are not API endpoints. Keep them callable by PostgreSQL,
--    but not by anonymous/authenticated REST RPC callers.
REVOKE EXECUTE ON FUNCTION public.fanout_admin_notification_from_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_low_wallet_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_topup_review() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_business_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_low_stock_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_order_item_demand() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_summary_from_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_summary_from_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_quickbite_student_account() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_protected_admin_auth_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_protected_admin_profile_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.student_can_update_order_notes_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_loyalty_points_for_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_staff_role_from_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_student_comment_from_notes() FROM PUBLIC, anon, authenticated;

-- 3) Legacy/maintenance endpoints should not be callable from the browser API.
REVOKE EXECUTE ON FUNCTION public.create_order_tx_legacy(uuid,text,text,text,text,integer,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_all_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_all_test_data(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_system_health_checks(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 4) Admin profile bootstrap must always operate on the currently authenticated user.
CREATE OR REPLACE FUNCTION public.create_admin_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_invite_code text DEFAULT ''::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_count integer;
  v_stored_code text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT COUNT(*) INTO v_admin_count
  FROM public.profiles
  WHERE role IN ('admin', 'both', 'administrator');

  IF v_admin_count > 0 THEN
    IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
      RAISE EXCEPTION 'invite_code_required';
    END IF;

    SELECT value INTO v_stored_code
    FROM public.app_secrets
    WHERE key = 'admin_invite_code';

    IF v_stored_code IS NULL THEN
      RAISE EXCEPTION 'invite_code_not_configured';
    END IF;

    IF trim(p_invite_code) <> v_stored_code THEN
      RAISE EXCEPTION 'invite_code_invalid';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'admin')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = 'admin',
        updated_at = NOW();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_admin_profile(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_profile(uuid,text,text,text) TO authenticated;

-- 5) Do not expose clearly private operational/account tables to unauthenticated GraphQL/REST callers.
REVOKE SELECT ON TABLE
  public.admin_notifications,
  public.audit_logs,
  public.automation_jobs,
  public.automation_settings,
  public.family_link_codes,
  public.favorites,
  public.loyalty_point_ledger,
  public.loyalty_redemptions,
  public.notifications,
  public.order_cancellation_requests,
  public.parent_active_student_context,
  public.parent_student_links,
  public.report_periods,
  public.staff_roles,
  public.student_data_consents,
  public.student_dietary_profiles,
  public.system_alerts,
  public.system_health_checks,
  public.wallet_accounts,
  public.wallet_topup_requests,
  public.wallet_transactions
FROM anon;

-- Keep the existing application role grants unchanged for authenticated/service_role.
