-- Permite solicitar cancelaciones parciales de una línea de producto.
ALTER TABLE public.order_cancellation_requests
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE public.order_cancellation_requests
  DROP CONSTRAINT IF EXISTS order_cancellation_requested_quantity_check;
ALTER TABLE public.order_cancellation_requests
  ADD CONSTRAINT order_cancellation_requested_quantity_check CHECK (requested_quantity IS NULL OR requested_quantity > 0);

CREATE OR REPLACE FUNCTION public.request_order_item_cancellation(p_order_item_id UUID,p_reason TEXT,p_requested_quantity INTEGER DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_item public.order_items; v_order public.orders; v_id UUID; v_refund NUMERIC(10,2); v_name TEXT; v_qty INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF length(trim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT oi.* INTO v_item FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.id=p_order_item_id AND o.user_id=auth.uid() FOR UPDATE OF oi;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_item_not_found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=v_item.order_id FOR UPDATE;
  IF v_order.status NOT IN ('pending','preparing') THEN RAISE EXCEPTION 'order_not_cancellable'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_cancellation_requests r WHERE r.order_item_id=v_item.id AND r.status='pending') THEN RAISE EXCEPTION 'cancellation_request_pending'; END IF;
  v_qty := COALESCE(p_requested_quantity,v_item.quantity);
  IF v_qty < 1 OR v_qty > v_item.quantity THEN RAISE EXCEPTION 'invalid_cancellation_quantity'; END IF;
  SELECT p.name INTO v_name FROM public.products p WHERE p.id=v_item.product_id;
  v_refund := CASE WHEN v_order.payment_status='confirmed' THEN v_item.price*v_qty ELSE 0 END;
  INSERT INTO public.order_cancellation_requests(order_id,order_item_id,user_id,reason,requested_quantity,product_name,refund_amount)
  VALUES(v_order.id,v_item.id,auth.uid(),left(trim(p_reason),500),v_qty,v_name,v_refund) RETURNING id INTO v_id;
  PERFORM public.write_system_audit_event('order_item.cancellation_requested','order',v_order.id::text,jsonb_build_object('order_item_id',v_item.id,'product_name',v_name,'quantity',v_qty,'refund_amount',v_refund));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_order_item_cancellation(UUID,TEXT,INTEGER) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_order_item_cancellation(UUID,TEXT,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_order_item_cancellation(p_order_item_id UUID,p_reason TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT public.request_order_item_cancellation(p_order_item_id,p_reason,NULL); $$;
REVOKE ALL ON FUNCTION public.request_order_item_cancellation(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_order_item_cancellation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_order_cancellation(p_request_id UUID,p_approve BOOLEAN,p_note TEXT DEFAULT NULL)
RETURNS public.order_cancellation_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.order_cancellation_requests; o public.orders; oi public.order_items; result public.order_cancellation_requests; v_new_balance NUMERIC; v_new_total NUMERIC(10,2); v_has_remaining BOOLEAN; v_cancel_qty INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO r FROM public.order_cancellation_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'cancellation_request_not_pending'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=r.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF p_approve THEN
    IF r.order_item_id IS NULL THEN
      IF o.status NOT IN ('pending','preparing') THEN RAISE EXCEPTION 'order_not_cancellable'; END IF;
      UPDATE public.orders SET status='cancelled',cancelled_at=NOW(),cancellation_reason=r.reason,updated_at=NOW() WHERE id=o.id;
    ELSE
      IF o.status NOT IN ('pending','preparing') THEN RAISE EXCEPTION 'order_not_cancellable'; END IF;
      SELECT * INTO oi FROM public.order_items WHERE id=r.order_item_id AND order_id=o.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'order_item_not_found'; END IF;
      v_cancel_qty := COALESCE(r.requested_quantity,oi.quantity);
      IF v_cancel_qty < 1 OR v_cancel_qty > oi.quantity THEN RAISE EXCEPTION 'invalid_cancellation_quantity'; END IF;
      IF oi.product_id IS NOT NULL THEN UPDATE public.products SET stock=stock+v_cancel_qty,updated_at=NOW() WHERE id=oi.product_id; END IF;
      IF v_cancel_qty=oi.quantity THEN DELETE FROM public.order_items WHERE id=oi.id; ELSE UPDATE public.order_items SET quantity=oi.quantity-v_cancel_qty WHERE id=oi.id; END IF;
      SELECT COALESCE(SUM(oi2.quantity*oi2.price),0) INTO v_new_total FROM public.order_items oi2 WHERE oi2.order_id=o.id;
      v_has_remaining := EXISTS (SELECT 1 FROM public.order_items WHERE order_id=o.id);
      UPDATE public.orders SET total=v_new_total,updated_at=NOW(),status=CASE WHEN NOT v_has_remaining THEN 'cancelled' ELSE status END,cancelled_at=CASE WHEN NOT v_has_remaining THEN NOW() ELSE cancelled_at END,cancellation_reason=CASE WHEN NOT v_has_remaining THEN r.reason ELSE cancellation_reason END WHERE id=o.id;
    END IF;
    IF r.refund_amount>0 AND o.payment_method='credits' THEN
      INSERT INTO public.wallet_accounts(user_id,balance) VALUES(o.user_id,r.refund_amount) ON CONFLICT(user_id) DO UPDATE SET balance=public.wallet_accounts.balance+r.refund_amount,updated_at=NOW();
      SELECT balance INTO v_new_balance FROM public.wallet_accounts WHERE user_id=o.user_id;
      INSERT INTO public.wallet_transactions(user_id,amount,balance_after,type,description,reference_id,order_id) VALUES(o.user_id,r.refund_amount,v_new_balance,'refund','Reembolso por cancelación aprobada',r.id::text,o.id);
      UPDATE public.order_cancellation_requests SET status='approved',refund_method='wallet',review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id;
    ELSE
      UPDATE public.order_cancellation_requests SET status='approved',refund_method=CASE WHEN r.refund_amount>0 THEN 'manual' ELSE 'none' END,review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id;
    END IF;
  ELSE
    UPDATE public.order_cancellation_requests SET status='rejected',refund_method='none',review_note=left(p_note,500),reviewed_by=auth.uid(),reviewed_at=NOW() WHERE id=r.id;
  END IF;
  SELECT * INTO result FROM public.order_cancellation_requests WHERE id=r.id;
  PERFORM public.write_system_audit_event(CASE WHEN p_approve THEN 'order.cancellation_approved' ELSE 'order.cancellation_rejected' END,'order',o.id::text,jsonb_build_object('refund_amount',r.refund_amount,'refund_method',result.refund_method,'order_item_id',r.order_item_id,'product_name',r.product_name,'requested_quantity',r.requested_quantity));
  INSERT INTO public.notifications(user_id,order_id,type,title,body) VALUES(o.user_id,o.id,'order_status',CASE WHEN p_approve THEN 'Cancelación aprobada' ELSE 'Cancelación rechazada' END,CASE WHEN p_approve THEN CASE WHEN r.order_item_id IS NULL THEN 'Tu solicitud de cancelación fue aprobada.' ELSE 'La cancelación de tu producto fue aprobada.' END ELSE CASE WHEN r.order_item_id IS NULL THEN 'Tu solicitud de cancelación fue rechazada.' ELSE 'La cancelación de tu producto fue rechazada.' END END);
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.review_order_cancellation(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_order_cancellation(UUID,BOOLEAN,TEXT) TO authenticated;
