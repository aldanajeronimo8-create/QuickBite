create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('entry','sale','reservation','release','return','adjustment')),
  quantity integer not null check (quantity > 0),
  previous_stock integer not null check (previous_stock >= 0),
  new_stock integer not null check (new_stock >= 0),
  user_id uuid null references public.profiles(id) on delete set null,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_id_idx on public.inventory_movements(product_id);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_type_idx on public.inventory_movements(movement_type);

alter table public.inventory_movements enable row level security;

drop policy if exists "Admins can read inventory movements" on public.inventory_movements;
create policy "Admins can read inventory movements"
on public.inventory_movements for select
to authenticated
using (public.is_admin());

create or replace function public.record_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $function$
declare
  v_delta integer;
  v_type text;
  v_reason text;
begin
  if new.stock is not distinct from old.stock then
    return new;
  end if;

  v_delta := new.stock - old.stock;
  v_type := current_setting('quickbite.inventory_movement_type', true);
  v_reason := nullif(trim(current_setting('quickbite.inventory_movement_reason', true)), '');

  if v_type is null or v_type not in ('entry','sale','reservation','release','return','adjustment') then
    v_type := case
      when current_setting('quickbite.internal_order_tx', true) = '1' and v_delta < 0 then 'sale'
      else 'adjustment'
    end;
  end if;

  if v_reason is null then
    v_reason := case
      when v_type = 'sale' then 'Venta automática por pedido'
      when v_type = 'reservation' then 'Reserva de inventario'
      when v_type = 'release' then 'Liberación de reserva'
      when v_type = 'return' then 'Devolución de inventario'
      when v_type = 'entry' then 'Entrada de inventario'
      else 'Ajuste de stock'
    end;
  end if;

  insert into public.inventory_movements (
    product_id, movement_type, quantity, previous_stock, new_stock, user_id, reason
  ) values (
    new.id, v_type, abs(v_delta), old.stock, new.stock, auth.uid(), v_reason
  );

  return new;
end;
$function$;

drop trigger if exists trg_products_inventory_movement on public.products;
create trigger trg_products_inventory_movement
after update of stock on public.products
for each row
execute function public.record_inventory_movement();

create or replace function public.admin_adjust_inventory(
  p_product_id uuid,
  p_new_stock integer,
  p_movement_type text default 'adjustment',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $function$
declare
  v_product public.products%rowtype;
  v_reason text;
  v_delta integer;
  v_movement_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_product_id is null then
    raise exception 'product_required';
  end if;
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'invalid_stock';
  end if;
  if p_movement_type not in ('entry','sale','reservation','release','return','adjustment') then
    raise exception 'invalid_movement_type';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found';
  end if;

  v_delta := p_new_stock - v_product.stock;
  if v_delta = 0 then
    raise exception 'stock_unchanged';
  end if;

  if p_movement_type in ('entry','release','return') and v_delta < 0 then
    raise exception 'movement_direction_invalid';
  end if;
  if p_movement_type in ('sale','reservation') and v_delta > 0 then
    raise exception 'movement_direction_invalid';
  end if;

  v_reason := nullif(trim(p_reason), '');
  if p_movement_type = 'adjustment' and v_reason is null then
    raise exception 'reason_required';
  end if;

  perform set_config('quickbite.inventory_movement_type', p_movement_type, true);
  perform set_config('quickbite.inventory_movement_reason', coalesce(v_reason, ''), true);

  update public.products
  set stock = p_new_stock,
      updated_at = now()
  where id = p_product_id;

  select id into v_movement_id
  from public.inventory_movements
  where product_id = p_product_id
    and previous_stock = v_product.stock
    and new_stock = p_new_stock
    and created_at >= clock_timestamp() - interval '5 seconds'
    and user_id = auth.uid()
  order by created_at desc
  limit 1;

  return v_movement_id;
end;
$function$;

drop publication if exists supabase_realtime;
create publication supabase_realtime for table public.inventory_movements, public.products, public.orders, public.order_items, public.notifications, public.profiles, public.categories, public.loyalty_settings, public.loyalty_rewards, public.loyalty_redemptions;
