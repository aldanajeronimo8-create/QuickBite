create or replace function public.admin_get_loyalty_settings()
returns table(id boolean, enabled boolean, points_per_currency_unit numeric, updated_at timestamptz)
language plpgsql security definer set search_path = 'public'
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select s.id, s.enabled, s.points_per_currency_unit, s.updated_at from public.loyalty_settings s where s.id = true;
end;
$$;

create or replace function public.admin_list_student_data_consents()
returns table(user_id uuid, student_name text, guardian_name text, guardian_relationship text, guardian_email text, student_acknowledged boolean, guardian_authorized boolean, privacy_policy_version text, consent_at timestamptz)
language plpgsql security definer set search_path = 'public'
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select c.user_id, c.student_name, c.guardian_name, c.guardian_relationship, c.guardian_email, c.student_acknowledged, c.guardian_authorized, c.privacy_policy_version, c.consent_at from public.student_data_consents c order by c.consent_at desc;
end;
$$;

create or replace function public.admin_list_report_orders(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at asc), '[]'::jsonb) into v_result
  from (
    select o.id, o.user_id, o.total, o.status, o.payment_method, o.payment_status, o.order_number, o.created_at, o.admin_hidden, o.pickup_code, o.estimated_minutes, o.payment_reference, o.notes, o.student_comment,
      case when p.id is null then null else jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name,'role',p.role,'ti',p.ti,'created_at',p.created_at) end as "user",
      coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'order_id',oi.order_id,'product_id',oi.product_id,'quantity',oi.quantity,'price',oi.price,'product',case when pr.id is null then null else jsonb_build_object('id',pr.id,'name',pr.name,'description',pr.description,'price',pr.price,'image_url',pr.image_url,'category_id',pr.category_id,'stock',pr.stock,'available',pr.available,'created_at',pr.created_at,'category',case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'created_at',c.created_at) end) end) order by oi.id) from public.order_items oi left join public.products pr on pr.id=oi.product_id left join public.categories c on c.id=pr.category_id where oi.order_id=o.id),'[]'::jsonb) as order_items
    from public.orders o left join public.profiles p on p.id=o.user_id
    where o.created_at >= p_start and o.created_at <= p_end
    order by o.created_at asc
  ) x;
  return v_result;
end;
$$;

revoke execute on function public.admin_get_loyalty_settings() from public, anon;
revoke execute on function public.admin_list_student_data_consents() from public, anon;
revoke execute on function public.admin_list_report_orders(timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_get_loyalty_settings() to authenticated;
grant execute on function public.admin_list_student_data_consents() to authenticated;
grant execute on function public.admin_list_report_orders(timestamptz,timestamptz) to authenticated;
