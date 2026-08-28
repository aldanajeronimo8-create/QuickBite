-- Admins can review and moderate loyalty redemptions.
alter table public.loyalty_redemptions enable row level security;

drop policy if exists "Admins can manage loyalty redemptions" on public.loyalty_redemptions;
create policy "Admins can manage loyalty redemptions"
on public.loyalty_redemptions
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','both','administrator')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','both','administrator')));
