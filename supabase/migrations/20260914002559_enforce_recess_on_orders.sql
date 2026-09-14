create or replace function public.create_order_tx(p_user_id uuid,p_payment_method text,p_payment_status text,p_status text,p_pickup_code text,p_estimated_minutes integer,p_payment_reference text,p_items jsonb,p_notes text,p_request_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
 v_order_id uuid:=gen_random_uuid(); v_order_number text:='QB'||to_char(now(),'YYMMDD')||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)); v_total numeric(10,2):=0; v_item jsonb; v_product record; v_quantity integer; v_existing_order_number text; v_existing_user_id uuid; v_slot public.pickup_slots; v_orders_count bigint; v_local_time time:=(current_timestamp at time zone 'America/Bogota')::time; v_local_date date:=(current_timestamp at time zone 'America/Bogota')::date; v_windows_enabled boolean:=coalesce(public.get_order_windows_enabled(),true); v_dow integer:=extract(dow from (current_timestamp at time zone 'America/Bogota')); v_recess_configured boolean:=false; v_recess_active boolean:=false;
begin
 perform set_config('quickbite.internal_order_tx','1',true);
 if auth.uid() is null or (p_user_id<>public.effective_student_user_id() and not public.is_admin()) then raise exception 'not_authorized'; end if;
 if p_request_id is null then raise exception 'order_request_id_required'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'order_items_required'; end if;
 if p_payment_method not in ('nequi','cash','bre-b','credits') then raise exception 'invalid_payment_method'; end if;
 select order_number,user_id into v_existing_order_number,v_existing_user_id from public.orders where client_request_id=p_request_id;
 if v_existing_order_number is not null then if v_existing_user_id<>p_user_id then raise exception 'order_request_id_conflict'; end if; return v_existing_order_number; end if;
 if not public.is_admin() then
   select exists(select 1 from public.recess_schedules where active and weekday=v_dow) into v_recess_configured;
   if v_recess_configured then
     select exists(select 1 from public.profiles p join public.recess_schedule_targets t on (t.course_id=p.course_id or (t.grade_id=p.grade_id and t.course_id is null) or (t.section_id=p.section_id and t.grade_id is null and t.course_id is null)) join public.recess_schedules s on s.id=t.recess_schedule_id where p.id=p_user_id and s.active and s.weekday=v_dow and v_local_time>=s.start_time and v_local_time<s.end_time) into v_recess_active;
     if not v_recess_active then raise exception 'no_active_recess_window'; end if;
   end if;
 end if;
 if v_windows_enabled then
   select s.* into v_slot from public.pickup_slots s where s.enabled and v_local_time>=s.starts_at and v_local_time<s.ends_at order by s.starts_at limit 1 for update;
   if not found then raise exception 'no_active_pickup_window'; end if;
   select count(*) into v_orders_count from public.orders o where o.pickup_slot_id=v_slot.id and o.status not in ('cancelled','rejected') and (o.created_at at time zone 'America/Bogota')::date=v_local_date;
   if v_slot.max_orders is not null and v_orders_count>=v_slot.max_orders then raise exception 'pickup_window_full'; end if;
 end if;
 begin
   insert into public.orders(id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,estimated_minutes,payment_reference,notes,student_comment,client_request_id,pickup_slot_id)
   values(v_order_id,p_user_id,0,p_status,p_payment_method,case when p_payment_method='credits' then 'confirmed' else p_payment_status end,v_order_number,p_pickup_code,p_estimated_minutes,p_payment_reference,nullif(trim(p_notes),''),nullif(trim(p_notes),''),p_request_id,case when v_windows_enabled then v_slot.id else null end);
 exception when unique_violation then select order_number,user_id into v_existing_order_number,v_existing_user_id from public.orders where client_request_id=p_request_id; if v_existing_order_number is not null and v_existing_user_id=p_user_id then return v_existing_order_number; end if; raise; end;
 for v_item in select * from jsonb_array_elements(p_items) loop
   v_quantity:=coalesce((v_item->>'quantity')::integer,0); if v_quantity<=0 then raise exception 'invalid_quantity'; end if;
   select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update; if not found or v_product.available is distinct from true then raise exception 'product_unavailable'; end if; if v_product.stock<v_quantity then raise exception 'insufficient_stock'; end if;
   update public.products set stock=stock-v_quantity,updated_at=now() where id=v_product.id; insert into public.order_items(order_id,product_id,quantity,price) values(v_order_id,v_product.id,v_quantity,v_product.price); v_total:=v_total+(v_product.price*v_quantity);
 end loop;
 update public.orders set total=v_total where id=v_order_id;
 if p_payment_method='credits' then perform public.apply_wallet_transaction(p_user_id,-v_total,'purchase','Compra QuickBite con créditos',v_order_id::text,v_order_id); update public.orders set payment_status='confirmed',payment_reference='PAGO-CON-CREDITOS' where id=v_order_id; end if;
 return v_order_number;
end; $$;
