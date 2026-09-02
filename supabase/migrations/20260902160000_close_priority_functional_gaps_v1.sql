CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.order_cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  refund_method TEXT CHECK (refund_method IN ('wallet','manual','none')), review_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_cancellation_open ON public.order_cancellation_requests(order_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_order_cancellation_user_created ON public.order_cancellation_requests(user_id,created_at DESC);
ALTER TABLE public.order_cancellation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_cancellation_select_own_or_admin ON public.order_cancellation_requests FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_admin());
CREATE POLICY order_cancellation_insert_own ON public.order_cancellation_requests FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY order_cancellation_update_admin ON public.order_cancellation_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.request_order_cancellation(p_order_id UUID,p_reason TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_order public.orders; v_id UUID;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF v_order.status NOT IN ('pending','preparing') THEN RAISE EXCEPTION 'order_not_cancellable'; END IF;
 IF trim(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION 'reason_required'; END IF;
 INSERT INTO public.order_cancellation_requests(order_id,user_id,reason,refund_amount) VALUES(v_order.id,auth.uid(),left(trim(p_reason),500),CASE WHEN v_order.payment_status='confirmed' THEN v_order.total ELSE 0 END) RETURNING id INTO v_id;
 PERFORM public.write_system_audit_event('order.cancellation_requested','order',v_order.id::text,jsonb_build_object('refund_amount',v_order.total));
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_order_cancellation(UUID,TEXT) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.request_order_cancellation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_order_cancellation_requests() RETURNS TABLE(id UUID,order_id UUID,user_id UUID,order_number TEXT,full_name TEXT,email TEXT,reason TEXT,status TEXT,refund_amount NUMERIC,refund_method TEXT,review_note TEXT,reviewed_by UUID,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF; RETURN QUERY SELECT r.id,r.order_id,r.user_id,o.order_number,p.full_name,p.email,r.reason,r.status,r.refund_amount,r.refund_method,r.review_note,r.reviewed_by,r.reviewed_at,r.created_at FROM public.order_cancellation_requests r JOIN public.orders o ON o.id=r.order_id JOIN public.profiles p ON p.id=r.user_id ORDER BY r.created_at DESC; END; $$;
REVOKE ALL ON FUNCTION public.admin_list_order_cancellation_requests() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.admin_list_order_cancellation_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_order_cancellation(p_request_id UUID,p_approve BOOLEAN,p_note TEXT DEFAULT NULL) RETURNS public.order_cancellation_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.order_cancellation_requests; o public.orders; result public.order_cancellation_requests; v_new_balance NUMERIC;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
 SELECT * INTO r FROM public.order_cancellation_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'cancellation_request_not_pending'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=r.order_id FOR UPDATE;
 IF p_approve THEN
  UPDATE public.orders SET status='cancelled',cancelled_at=NOW(),cancellation_reason=r.reason WHERE id=o.id;
  IF r.refund_amount>0 AND o.payment_method='credits' THEN
   INSERT INTO public.wallet_accounts(user_id,balance) VALUES(o.user_id,r.refund_amount) ON CONFLICT(user_id) DO UPDATE SET balance=public.wallet_accounts.balance+r.refund_amount,updated_at=NOW();
   SELECT balance INTO v_new_balance FROM public.wallet_accounts WHERE user_id=o.user_id;
   INSERT INTO public.wallet_transactions(user_id,amount,balance_after,type,description,reference_id,order_id) VALUES(o.user_id,r.refund_amount,v_new_balance,'refund','Reembolso por cancelación aprobada',r.id::text,o.id);
   UPDATE public.order_cancellation_requests SET status='approved',refund_method='wallet',review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id;
  ELSE UPDATE public.order_cancellation_requests SET status='approved',refund_method=CASE WHEN r.refund_amount>0 THEN 'manual' ELSE 'none' END,review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id; END IF;
 ELSE UPDATE public.order_cancellation_requests SET status='rejected',refund_method='none',review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id; END IF;
 SELECT * INTO result FROM public.order_cancellation_requests WHERE id=r.id;
 INSERT INTO public.notifications(user_id,order_id,type,title,body) VALUES(o.user_id,o.id,'order_status',CASE WHEN p_approve THEN 'Cancelación aprobada' ELSE 'Cancelación rechazada' END,CASE WHEN p_approve THEN 'Tu solicitud de cancelación fue aprobada.' ELSE 'Tu solicitud de cancelación fue rechazada.' END);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.review_order_cancellation(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.review_order_cancellation(UUID,BOOLEAN,TEXT) TO authenticated;

ALTER TABLE public.wallet_accounts ADD COLUMN IF NOT EXISTS low_balance_threshold NUMERIC(10,2) NOT NULL DEFAULT 10000 CHECK(low_balance_threshold>=0);
CREATE OR REPLACE FUNCTION public.notify_low_wallet_balance() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN IF NEW.balance<=NEW.low_balance_threshold AND (TG_OP='INSERT' OR OLD.balance>OLD.low_balance_threshold) THEN INSERT INTO public.notifications(user_id,type,title,body) SELECT NEW.user_id,'wallet_low_balance','Saldo bajo','Tu saldo está por debajo del umbral configurado.' WHERE NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.user_id=NEW.user_id AND n.type='wallet_low_balance' AND n.created_at>NOW()-INTERVAL '24 hours'); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS wallet_low_balance_alert ON public.wallet_accounts;
CREATE TRIGGER wallet_low_balance_alert AFTER INSERT OR UPDATE OF balance ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION public.notify_low_wallet_balance();

CREATE OR REPLACE FUNCTION public.get_order_window_status(p_slot_id UUID DEFAULT NULL) RETURNS TABLE(slot_id UUID,slot_name TEXT,starts_at TIME,ends_at TIME,enabled BOOLEAN,max_orders INTEGER,orders_count BIGINT,accepting_orders BOOLEAN) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT s.id,s.name,s.starts_at,s.ends_at,s.enabled,s.max_orders,(SELECT count(*) FROM public.orders o WHERE o.pickup_slot_id=s.id AND o.status NOT IN('cancelled','rejected') AND o.created_at::date=CURRENT_DATE),s.enabled AND CURRENT_TIME BETWEEN s.starts_at AND s.ends_at AND (s.max_orders IS NULL OR (SELECT count(*) FROM public.orders o WHERE o.pickup_slot_id=s.id AND o.status NOT IN('cancelled','rejected') AND o.created_at::date=CURRENT_DATE)<s.max_orders) FROM public.pickup_slots s WHERE p_slot_id IS NULL OR s.id=p_slot_id ORDER BY s.starts_at; $$;
REVOKE ALL ON FUNCTION public.get_order_window_status(UUID) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_order_window_status(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.product_inventory_status AS SELECT p.id,p.name,p.price,p.stock AS available_stock,COALESCE(SUM(CASE WHEN o.status IN('pending','preparing','ready') AND o.payment_status IN('pending','confirmed') THEN oi.quantity ELSE 0 END),0)::INTEGER AS reserved_stock,(p.stock+COALESCE(SUM(CASE WHEN o.status IN('pending','preparing','ready') AND o.payment_status IN('pending','confirmed') THEN oi.quantity ELSE 0 END),0))::INTEGER AS total_stock,p.available FROM public.products p LEFT JOIN public.order_items oi ON oi.product_id=p.id LEFT JOIN public.orders o ON o.id=oi.order_id GROUP BY p.id,p.name,p.price,p.stock,p.available;
GRANT SELECT ON public.product_inventory_status TO authenticated;

CREATE OR REPLACE FUNCTION public.get_repeat_order(p_order_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ DECLARE v_user UUID:=auth.uid();v_owner UUID;v_result JSONB; BEGIN SELECT user_id INTO v_owner FROM public.orders WHERE id=p_order_id; IF v_owner IS NULL OR(v_owner<>v_user AND NOT public.is_admin()) THEN RAISE EXCEPTION 'not_authorized'; END IF; SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id',oi.product_id,'quantity',oi.quantity,'price',oi.price) ORDER BY oi.created_at),'[]'::jsonb) INTO v_result FROM public.order_items oi WHERE oi.order_id=p_order_id; RETURN v_result; END; $$;
REVOKE ALL ON FUNCTION public.get_repeat_order(UUID) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_repeat_order(UUID) TO authenticated;
CREATE OR REPLACE VIEW public.product_sales_rankings AS SELECT p.id AS product_id,p.name,COALESCE(SUM(oi.quantity) FILTER(WHERE o.status='delivered' AND o.payment_status='confirmed'),0)::BIGINT AS units_sold,COALESCE(SUM(oi.quantity*oi.price) FILTER(WHERE o.status='delivered' AND o.payment_status='confirmed'),0)::NUMERIC(12,2) AS revenue,COUNT(DISTINCT o.id) FILTER(WHERE o.status='delivered' AND o.payment_status='confirmed')::BIGINT AS order_count FROM public.products p LEFT JOIN public.order_items oi ON oi.product_id=p.id LEFT JOIN public.orders o ON o.id=oi.order_id GROUP BY p.id,p.name;
GRANT SELECT ON public.product_sales_rankings TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_audit_events(p_limit INTEGER DEFAULT 200) RETURNS TABLE(source TEXT,id TEXT,created_at TIMESTAMPTZ,actor_id UUID,action TEXT,module TEXT,operation TEXT,entity_type TEXT,entity_id TEXT,status TEXT,metadata JSONB) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF; RETURN QUERY SELECT 'system'::TEXT,l.id::TEXT,l.created_at,l.actor_user_id,l.action,l.module,l.operation,l.entity_type,l.entity_id,l.status,l.metadata FROM public.system_audit_logs l UNION ALL SELECT 'legacy'::TEXT,l.id::TEXT,l.created_at,l.actor_id,l.action,COALESCE(split_part(l.action,'.',1),'legacy'),COALESCE(split_part(l.action,'.',2),'event'),l.entity,l.entity_id,'success'::TEXT,l.metadata FROM public.audit_logs l ORDER BY created_at DESC LIMIT GREATEST(1,LEAST(COALESCE(p_limit,200),500)); END; $$;
REVOKE ALL ON FUNCTION public.admin_list_audit_events(INTEGER) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_list_audit_events(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_product_allergens(p_product_id UUID) RETURNS TABLE(allergen TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT pa.allergen FROM public.product_allergens pa WHERE pa.product_id=p_product_id ORDER BY pa.allergen; $$;
REVOKE ALL ON FUNCTION public.list_product_allergens(UUID) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.list_product_allergens(UUID) TO authenticated;
