ALTER TABLE public.wallet_topup_requests ADD COLUMN IF NOT EXISTS comment text;

CREATE OR REPLACE FUNCTION public.request_wallet_topup(
  p_amount numeric,
  p_method text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid;
  v_active_student uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_amount <= 0 OR p_amount > 500000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_method NOT IN ('manual','nequi','bre-b') THEN RAISE EXCEPTION 'invalid_method'; END IF;
  SELECT public.get_parent_active_student() INTO v_active_student;
  v_target := COALESCE(p_user_id, v_active_student, v_actor);
  IF v_target <> v_actor AND NOT public.is_linked_parent(v_target) AND NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  INSERT INTO public.wallet_topup_requests(user_id, amount, method, reference, comment)
  VALUES(v_target, p_amount, p_method, nullif(trim(p_reference), ''), nullif(trim(p_comment), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_wallet_topup(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.wallet_topup_requests%rowtype;
  v_balance numeric;
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','both')) INTO v_is_admin;
  IF auth.uid() IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_request FROM public.wallet_topup_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'request_already_reviewed'; END IF;
  INSERT INTO public.wallet_accounts(user_id,balance) VALUES(v_request.user_id,0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallet_accounts SET balance=balance+v_request.amount, updated_at=now() WHERE user_id=v_request.user_id RETURNING balance INTO v_balance;
  INSERT INTO public.wallet_transactions(user_id,amount,balance_after,type,description,reference_id)
  VALUES(v_request.user_id,v_request.amount,v_balance,'top_up','Recarga de billetera',v_request.id::text);
  UPDATE public.wallet_topup_requests SET status='approved', reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_wallet_topup(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_is_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','both')) INTO v_is_admin;
  IF auth.uid() IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.wallet_topup_requests
  SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=nullif(trim(p_reason),'')
  WHERE id=p_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found_or_reviewed'; END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_wallet_topup(numeric,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_wallet_topup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup(uuid,text) TO authenticated;
