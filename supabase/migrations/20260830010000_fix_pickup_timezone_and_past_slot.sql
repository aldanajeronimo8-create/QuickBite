create or replace function public.schedule_order_for_user(
  p_order_number text,
  p_user_id uuid,
  p_pickup_slot_id uuid,
  p_scheduled_for timestamptz
)
returns table(id uuid, order_number text, pickup_slot_id uuid, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_slot record;
  v_order_id uuid;
  v_existing_count integer;
  v_local_now timestamp := (now() at time zone 'America/Bogota');
  v_local_scheduled timestamp;
  v_local_date date;
  v_target_time time;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not_authorized';
  end if;
  if p_scheduled_for is null then
    raise exception 'scheduled_for_required';
  end if;

  select id, name, starts_at, ends_at, enabled, max_orders
    into v_slot
  from public.pickup_slots
  where id = p_pickup_slot_id;
  if not found or v_slot.enabled is distinct from true then
    raise exception 'pickup_slot_unavailable';
  end if;

  v_local_scheduled := p_scheduled_for at time zone 'America/Bogota';
  v_target_time := v_slot.starts_at;
  v_local_date := v_local_scheduled::date;

  if v_local_scheduled < v_local_now then
    v_local_date := v_local_now::date;
    loop
      v_local_date := v_local_date + 1;
      exit when extract(isodow from v_local_date) between 1 and 5;
    end loop;
  elsif extract(isodow from v_local_date) > 5 then
    loop
      v_local_date := v_local_date + 1;
      exit when extract(isodow from v_local_date) between 1 and 5;
    end loop;
  end if;

  v_local_scheduled := v_local_date + v_target_time;

  select count(*)::integer
    into v_existing_count
  from public.orders o
  where o.pickup_slot_id = p_pickup_slot_id
    and (o.scheduled_for at time zone 'America/Bogota')::date = v_local_date
    and o.status <> 'cancelled';

  if v_slot.max_orders is not null and v_existing_count >= v_slot.max_orders then
    raise exception 'pickup_slot_full';
  end if;

  update public.orders
     set pickup_slot_id = p_pickup_slot_id,
         scheduled_for = v_local_scheduled at time zone 'America/Bogota'
   where order_number = p_order_number
     and user_id = p_user_id
   returning orders.id into v_order_id;

  if v_order_id is null then
    raise exception 'order_not_found';
  end if;

  return query
  select o.id, o.order_number, o.pickup_slot_id, o.scheduled_for
  from public.orders o
  where o.id = v_order_id;
end;
$$;

revoke all on function public.schedule_order_for_user(text, uuid, uuid, timestamptz) from public;
grant execute on function public.schedule_order_for_user(text, uuid, uuid, timestamptz) to authenticated;
