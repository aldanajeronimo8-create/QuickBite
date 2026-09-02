-- Harden public SECURITY DEFINER RPC exposure and pin search_path settings.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.fn);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.reset_password_with_ti(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.reset_user_password(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_student_link_code(text) TO anon;

GRANT EXECUTE ON FUNCTION public.create_student_profile(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_profile(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_profile_with_consent(uuid,text,text,text,text,text,text,boolean,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_parent_profile_with_role(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pending_parent_registration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_student_code(boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_active_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_student_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_parent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_parent_to_student(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_student_by_code(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_wallet_topup(numeric,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_order_for_user(text,uuid,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_parent_active_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_student_identity(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_system_audit_event(text,text,text,jsonb,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_create_product(text,text,numeric,text,uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fulfill_loyalty_redemption(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_automation_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_order_payment(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_automation_setting(text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_payment(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_product(uuid,text,text,numeric,text,uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_protected_credentials(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_wallet_topup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_exported_redemptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_wallet_topup_requests(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_protected_admin_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_loyalty_redemption(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_test_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_admin_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_quickbite_automations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid,text,text,text,text,integer,text,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx_legacy(uuid,text,text,text,text,integer,text,jsonb,text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid,numeric,text,text,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_admin_invite_code(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_code IS NULL THEN RAISE EXCEPTION 'invalid_invite_code'; END IF;
  IF p_code='' THEN DELETE FROM public.app_secrets WHERE key='admin_invite_code'; ELSE
    INSERT INTO public.app_secrets(key,value) VALUES('admin_invite_code',p_code)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_admin_invite_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_student_profile(p_user_id uuid,p_email text,p_full_name text,p_ti text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid()<>p_user_id THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF NULLIF(trim(p_ti),'') IS NULL THEN RAISE EXCEPTION 'ti_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE ti=trim(p_ti) AND id<>p_user_id) THEN RAISE EXCEPTION 'ti_already_registered'; END IF;
  INSERT INTO public.profiles(id,email,full_name,role,ti) VALUES(p_user_id,lower(trim(p_email)),trim(p_full_name),'student',trim(p_ti))
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,full_name=EXCLUDED.full_name,role='student',ti=EXCLUDED.ti,updated_at=NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_student_profile(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_student_profile(p_user_id uuid,p_email text,p_full_name text,p_grade text,p_student_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid()<>p_user_id THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.profiles(id,email,full_name,role,grade,student_code) VALUES(p_user_id,lower(trim(p_email)),trim(p_full_name),'student',p_grade,p_student_code)
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,full_name=EXCLUDED.full_name,role='student',grade=EXCLUDED.grade,student_code=EXCLUDED.student_code,updated_at=NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_student_profile(uuid,text,text,text,text) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER FUNCTION public.touch_updated_at() SET search_path=public;
ALTER FUNCTION public.sync_loyalty_reward_points_cost() SET search_path=public;
ALTER FUNCTION public.set_order_status(uuid,text) SET search_path=public;
ALTER FUNCTION public.enforce_product_availability() SET search_path=public;
