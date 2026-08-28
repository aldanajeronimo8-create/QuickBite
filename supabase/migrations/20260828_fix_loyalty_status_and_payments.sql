-- QuickBite: normalize loyalty redemption states and payment approval rules.
-- This migration intentionally accepts only states used by the application.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loyalty_redemptions_status_check' and conrelid = 'public.loyalty_redemptions'::regclass) then
    alter table public.loyalty_redemptions drop constraint loyalty_redemptions_status_check;
  end if;
exception when undefined_table then null;
end $$;

alter table public.loyalty_redemptions
  add constraint loyalty_redemptions_status_check
  check (status in ('pending','approved','fulfilled','delivered','cancelled'));

-- Existing reservations created by older builds are normalized to pending.
update public.loyalty_redemptions set status = 'pending' where status = 'reserved';

-- Payment methods supported by the final QuickBite flow.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'orders_payment_method_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders drop constraint orders_payment_method_check;
  end if;
  alter table public.orders add constraint orders_payment_method_check
    check (payment_method in ('nequi','cash','bre-b','bank_keys'));
exception when undefined_table then null;
end $$;

-- Every payment must be explicitly reviewed before pickup QR is available.
update public.orders
set payment_status = 'pending'
where payment_status is null;

create or replace function public.admin_moderate_order_payment(p_order_id uuid, p_action text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_status text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;
  if p_action not in ('approve','reject') then
    raise exception 'invalid_payment_action';
  end if;
  v_status := case when p_action = 'approve' then 'confirmed' else 'rejected' end;
  update public.orders
  set payment_status = v_status
  where id = p_order_id
  returning * into v_order;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  return v_order;
end;
$$;

grant execute on function public.admin_moderate_order_payment(uuid,text) to authenticated;
