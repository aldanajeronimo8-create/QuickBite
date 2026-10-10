alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
 check (type = any (array['order_status','reward_redemption','wallet_topup_approved','wallet_topup_rejected']::text[]));

create or replace function public.request_wallet_topup(p_amount numeric,p_method text default 'manual',p_reference text default null,p_user_id uuid default null,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_target uuid; v_active_student uuid; v_id uuid; v_name text;
begin
 if v_actor is null then raise exception 'unauthorized'; end if;
 if p_amount is null or p_amount<=0 or p_amount>500000 then raise exception 'invalid_amount'; end if;
 if p_method not in ('manual','nequi','bre-b') then raise exception 'invalid_method'; end if;
 select public.get_parent_active_student() into v_active_student;
 v_target:=coalesce(p_user_id,v_active_student,v_actor);
 if v_target<>v_actor and not public.is_linked_parent(v_target) and not public.is_admin() then raise exception 'not_authorized'; end if;
 select full_name into v_name from public.profiles where id=v_target;
 insert into public.wallet_topup_requests(user_id,amount,method,reference,comment)
 values(v_target,p_amount,p_method,nullif(trim(p_reference),''),nullif(trim(p_comment),'')) returning id into v_id;
 insert into public.admin_notifications(admin_user_id,section,title,body,entity_type,entity_id,metadata)
 select p.id,'wallet','Nueva solicitud de recarga',coalesce(v_name,'Un usuario') || ' solicitó una recarga de $' || to_char(p_amount,'FM999G999G999G990'),
 'wallet_topup_request',v_id::text,jsonb_build_object('request_id',v_id,'user_id',v_target,'amount',p_amount)
 from public.profiles p where p.role in ('admin','both') and p.active=true;
 return v_id;
end; $$;
revoke all on function public.request_wallet_topup(numeric,text,text,uuid,text) from public,anon;
grant execute on function public.request_wallet_topup(numeric,text,text,uuid,text) to authenticated;

create or replace function public.admin_approve_wallet_topup(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_request public.wallet_topup_requests%rowtype; v_previous_balance numeric; v_new_balance numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'unauthorized'; end if;
 select * into v_request from public.wallet_topup_requests where id=p_request_id for update;
 if not found then raise exception 'request_not_found'; end if;
 if v_request.status<>'pending' then raise exception 'request_already_reviewed'; end if;
 insert into public.wallet_accounts(user_id,balance) values(v_request.user_id,0) on conflict(user_id) do nothing;
 select balance into v_previous_balance from public.wallet_accounts where user_id=v_request.user_id for update;
 update public.wallet_accounts set balance=balance+v_request.amount,updated_at=now() where user_id=v_request.user_id returning balance into v_new_balance;
 insert into public.wallet_transactions(user_id,amount,balance_after,type,description,reference_id)
 values(v_request.user_id,v_request.amount,v_new_balance,'top_up','Recarga de billetera',v_request.id::text);
 update public.wallet_topup_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
 insert into public.notifications(user_id,order_id,type,title,body)
 values(v_request.user_id,null,'wallet_topup_approved','Recarga aprobada',
 'Tu recarga de $' || to_char(v_request.amount,'FM999G999G999G990') || ' fue aprobada. Tu nuevo saldo es $' || to_char(v_new_balance,'FM999G999G999G990') || '.');
 return jsonb_build_object('request_id',v_request.id,'user_id',v_request.user_id,'amount',v_request.amount,'previous_balance',v_previous_balance,'new_balance',v_new_balance,'status','approved');
end; $$;
revoke all on function public.admin_approve_wallet_topup(uuid) from public,anon;
grant execute on function public.admin_approve_wallet_topup(uuid) to authenticated;

create or replace function public.reject_wallet_topup(p_request_id uuid,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_request public.wallet_topup_requests%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'unauthorized'; end if;
 select * into v_request from public.wallet_topup_requests where id=p_request_id for update;
 if not found or v_request.status<>'pending' then raise exception 'request_not_found_or_reviewed'; end if;
 update public.wallet_topup_requests set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=nullif(trim(p_reason),'') where id=p_request_id;
 insert into public.notifications(user_id,order_id,type,title,body)
 values(v_request.user_id,null,'wallet_topup_rejected','Recarga rechazada',
 'Tu solicitud de recarga de $' || to_char(v_request.amount,'FM999G999G999G990') || ' fue rechazada.' ||
 case when nullif(trim(p_reason),'') is not null then ' Motivo: ' || trim(p_reason) else '' end);
end; $$;
revoke all on function public.reject_wallet_topup(uuid,text) from public,anon;
grant execute on function public.reject_wallet_topup(uuid,text) to authenticated;
