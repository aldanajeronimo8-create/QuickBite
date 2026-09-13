alter table public.parent_food_blocks drop constraint if exists parent_food_blocks_parent_user_id_student_user_id_product_id_key;
alter table public.parent_food_blocks add constraint parent_food_blocks_student_product_key unique(student_user_id, product_id);

create or replace function public.get_parent_food_controls(p_student_user_id uuid)
returns table (
  product_id uuid,
  product_name text,
  description text,
  price numeric,
  image_url text,
  category_id uuid,
  category_name text,
  blocked boolean,
  reason text
)
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $$
declare
  v_is_parent boolean := false;
  v_is_admin boolean := false;
begin
  v_is_parent := coalesce((select role = 'parent' from public.profiles where id = auth.uid()), false);
  v_is_admin := public.is_admin();
  if not v_is_admin and (not v_is_parent or not exists (
    select 1 from public.parent_student_links l
    where l.parent_user_id = auth.uid() and l.student_user_id = p_student_user_id and l.active
  )) then
    raise exception 'not_authorized';
  end if;
  return query
  select p.id, p.name, p.description, p.price, p.image_url, p.category_id, c.name,
         (b.id is not null), b.reason
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.parent_food_blocks b
    on b.product_id = p.id and b.student_user_id = p_student_user_id
  where p.available = true or v_is_admin
  order by c.name nulls last, p.name;
end;
$$;

create or replace function public.set_parent_food_block(
  p_student_user_id uuid,
  p_product_id uuid,
  p_blocked boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $$
begin
  if not exists (
    select 1 from public.parent_student_links l
    where l.parent_user_id = auth.uid() and l.student_user_id = p_student_user_id and l.active
  ) and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'product_not_found';
  end if;

  if p_blocked then
    insert into public.parent_food_blocks(parent_user_id, student_user_id, product_id, reason)
    values(auth.uid(), p_student_user_id, p_product_id, nullif(trim(p_reason), ''))
    on conflict (student_user_id, product_id)
    do update set parent_user_id = excluded.parent_user_id, reason = excluded.reason;
  else
    delete from public.parent_food_blocks
    where student_user_id = p_student_user_id
      and product_id = p_product_id;
  end if;
  return p_blocked;
end;
$$;
