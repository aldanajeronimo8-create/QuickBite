-- Expose loyalty redemptions as a read-only activity stream for admins only.
-- security_invoker and the explicit predicate prevent this view from bypassing
-- row-level security when it is queried through the API.
create or replace view public.admin_order_activity
with (security_invoker = true) as
select
  o.id,
  o.order_number,
  o.user_id,
  o.created_at,
  'order'::text as activity_type,
  null::uuid as redemption_id,
  null::uuid as reward_id,
  null::text as reward_name,
  null::integer as points_spent,
  o.status,
  o.payment_status,
  o.total,
  o.pickup_code,
  o.notes
from public.orders o
where public.is_admin()
union all
select
  r.id,
  r.redemption_code as order_number,
  r.user_id,
  r.created_at,
  'redemption'::text as activity_type,
  r.id as redemption_id,
  r.reward_id,
  coalesce(lr.title, 'Recompensa') as reward_name,
  r.points_spent,
  r.status,
  'confirmed'::text as payment_status,
  0::numeric as total,
  r.redemption_code as pickup_code,
  null::text as notes
from public.loyalty_redemptions r
left join public.loyalty_rewards lr on lr.id = r.reward_id
where public.is_admin();

grant select on public.admin_order_activity to authenticated;
