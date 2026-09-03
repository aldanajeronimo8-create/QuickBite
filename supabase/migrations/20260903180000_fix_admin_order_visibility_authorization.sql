-- Keep the production schema in sync with the admin order visibility flow.
-- Admin-only listing/archiving is enforced inside SECURITY DEFINER functions.

create or replace function public.list_admin_orders()
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    select o.*
    from public.orders o
    where o.admin_hidden = false
    order by o.created_at desc;
end;
$$;

revoke all on function public.list_admin_orders() from public;
grant execute on function public.list_admin_orders() to authenticated;

create or replace function public.admin_archive_orders(p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    return 0;
  end if;

  update public.orders
     set admin_hidden = true
   where id = any(p_order_ids)
     and admin_hidden = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_archive_orders(uuid[]) from public;
grant execute on function public.admin_archive_orders(uuid[]) to authenticated;
