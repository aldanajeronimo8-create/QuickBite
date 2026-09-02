CREATE OR REPLACE FUNCTION public.admin_upsert_pickup_slot(p_id UUID,p_name TEXT,p_starts_at TIME,p_ends_at TIME,p_enabled BOOLEAN DEFAULT true,p_max_orders INTEGER DEFAULT NULL)
RETURNS public.pickup_slots LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.pickup_slots;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
 IF trim(COALESCE(p_name,''))='' OR p_starts_at>=p_ends_at THEN RAISE EXCEPTION 'invalid_pickup_slot'; END IF;
 IF p_max_orders IS NOT NULL AND p_max_orders<=0 THEN RAISE EXCEPTION 'invalid_capacity'; END IF;
 IF p_id IS NULL THEN INSERT INTO public.pickup_slots(name,starts_at,ends_at,enabled,max_orders) VALUES(left(trim(p_name),80),p_starts_at,p_ends_at,p_enabled,p_max_orders) RETURNING * INTO r;
 ELSE UPDATE public.pickup_slots SET name=left(trim(p_name),80),starts_at=p_starts_at,ends_at=p_ends_at,enabled=p_enabled,max_orders=p_max_orders WHERE id=p_id RETURNING * INTO r; IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_found'; END IF; END IF;
 PERFORM public.write_system_audit_event('operations.pickup_slot_updated','pickup_slot',r.id::text,jsonb_build_object('name',r.name,'enabled',r.enabled,'max_orders',r.max_orders)); RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.admin_upsert_pickup_slot(UUID,TEXT,TIME,TIME,BOOLEAN,INTEGER) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_upsert_pickup_slot(UUID,TEXT,TIME,TIME,BOOLEAN,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_low_balance_threshold(p_user_id UUID,p_threshold NUMERIC)
RETURNS public.wallet_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.wallet_accounts;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
 IF p_threshold<0 THEN RAISE EXCEPTION 'invalid_threshold'; END IF;
 INSERT INTO public.wallet_accounts(user_id,balance,low_balance_threshold) VALUES(p_user_id,0,p_threshold) ON CONFLICT(user_id) DO UPDATE SET low_balance_threshold=p_threshold,updated_at=NOW() RETURNING * INTO r; RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_low_balance_threshold(UUID,NUMERIC) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_set_low_balance_threshold(UUID,NUMERIC) TO authenticated;
