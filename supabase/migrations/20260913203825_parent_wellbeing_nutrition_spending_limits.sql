-- Align repository migrations with the already-applied parent wellbeing,
-- nutrition and student spending-limit schema in Supabase.

create table if not exists public.product_nutrition (
  product_id uuid primary key references public.products(id) on delete cascade,
  calories numeric,
  protein_g numeric,
  carbohydrates_g numeric,
  fat_g numeric,
  fiber_g numeric,
  ingredients text,
  allergens text,
  vegetarian boolean not null default false,
  healthy_choice boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.product_nutrition enable row level security;
drop policy if exists product_nutrition_public_read on public.product_nutrition;
create policy product_nutrition_public_read
  on public.product_nutrition for select
  using (true);
drop policy if exists product_nutrition_admin_write on public.product_nutrition;
create policy product_nutrition_admin_write
  on public.product_nutrition for all
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.student_spending_limits (
  student_user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_limit numeric,
  weekly_limit numeric,
  monthly_limit numeric,
  updated_at timestamptz not null default now()
);

alter table public.student_spending_limits enable row level security;
drop policy if exists spending_limits_parent_read on public.student_spending_limits;
create policy spending_limits_parent_read
  on public.student_spending_limits for select
  using (
    student_user_id = public.effective_student_user_id()
    or exists (
      select 1
      from public.parent_student_links l
      where l.parent_user_id = auth.uid()
        and l.student_user_id = student_spending_limits.student_user_id
        and l.active = true
    )
  );

create or replace function public.get_parent_spending_limit(p_student_user_id uuid)
returns public.student_spending_limits
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  result public.student_spending_limits;
begin
  if not exists (
    select 1 from public.parent_student_links
    where parent_user_id = auth.uid()
      and student_user_id = p_student_user_id
      and active = true
  ) then
    raise exception 'student_not_linked';
  end if;
  select * into result
  from public.student_spending_limits
  where student_user_id = p_student_user_id;
  return result;
end;
$$;

create or replace function public.set_parent_spending_limits(
  p_student_user_id uuid,
  p_daily_limit numeric,
  p_weekly_limit numeric,
  p_monthly_limit numeric
)
returns public.student_spending_limits
language plpgsql security definer
set search_path to 'public'
as $$
declare
  result public.student_spending_limits;
begin
  if not exists (
    select 1 from public.parent_student_links
    where parent_user_id = auth.uid()
      and student_user_id = p_student_user_id
      and active = true
  ) then
    raise exception 'student_not_linked';
  end if;
  if (p_daily_limit is not null and p_daily_limit < 0)
     or (p_weekly_limit is not null and p_weekly_limit < 0)
     or (p_monthly_limit is not null and p_monthly_limit < 0) then
    raise exception 'invalid_spending_limit';
  end if;
  insert into public.student_spending_limits(student_user_id,daily_limit,weekly_limit,monthly_limit)
  values(p_student_user_id,p_daily_limit,p_weekly_limit,p_monthly_limit)
  on conflict(student_user_id) do update set
    daily_limit=excluded.daily_limit,
    weekly_limit=excluded.weekly_limit,
    monthly_limit=excluded.monthly_limit,
    updated_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.get_parent_student_spending_summary(p_student_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.parent_student_links
    where parent_user_id=auth.uid()
      and student_user_id=p_student_user_id
      and active=true
  ) then
    raise exception 'student_not_linked';
  end if;
  select jsonb_build_object(
    'today', coalesce((select sum(total) from public.orders where user_id=p_student_user_id and created_at>=date_trunc('day',now()) and status not in ('cancelled','rejected')),0),
    'week', coalesce((select sum(total) from public.orders where user_id=p_student_user_id and created_at>=date_trunc('week',now()) and status not in ('cancelled','rejected')),0),
    'month', coalesce((select sum(total) from public.orders where user_id=p_student_user_id and created_at>=date_trunc('month',now()) and status not in ('cancelled','rejected')),0),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'order_number',o.order_number,'total',o.total,'status',o.status,'created_at',o.created_at) order by o.created_at desc) from (select * from public.orders where user_id=p_student_user_id order by created_at desc limit 10) o),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_parent_spending_limit(uuid) to authenticated;
grant execute on function public.set_parent_spending_limits(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.get_parent_student_spending_summary(uuid) to authenticated;

create or replace function public.enforce_student_spending_limits()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  lim public.student_spending_limits;
  today_total numeric;
  week_total numeric;
  month_total numeric;
begin
  select * into lim from public.student_spending_limits where student_user_id=new.user_id;
  if lim.student_user_id is null or new.status in ('cancelled','rejected') then
    return new;
  end if;
  select coalesce(sum(total),0) into today_total from public.orders where user_id=new.user_id and created_at>=date_trunc('day',now()) and status not in ('cancelled','rejected');
  select coalesce(sum(total),0) into week_total from public.orders where user_id=new.user_id and created_at>=date_trunc('week',now()) and status not in ('cancelled','rejected');
  select coalesce(sum(total),0) into month_total from public.orders where user_id=new.user_id and created_at>=date_trunc('month',now()) and status not in ('cancelled','rejected');
  if lim.daily_limit is not null and today_total+new.total>lim.daily_limit then raise exception 'daily_spending_limit_reached'; end if;
  if lim.weekly_limit is not null and week_total+new.total>lim.weekly_limit then raise exception 'weekly_spending_limit_reached'; end if;
  if lim.monthly_limit is not null and month_total+new.total>lim.monthly_limit then raise exception 'monthly_spending_limit_reached'; end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_student_spending_limits on public.orders;
create trigger trg_enforce_student_spending_limits
  before insert on public.orders
  for each row execute function public.enforce_student_spending_limits();
