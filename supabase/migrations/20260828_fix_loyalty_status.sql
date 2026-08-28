-- Normalize legacy redemption state before applying the final constraint.
update public.loyalty_redemptions
set status = 'pending'
where status = 'reserved';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loyalty_redemptions_status_check' and conrelid = 'public.loyalty_redemptions'::regclass) then
    alter table public.loyalty_redemptions drop constraint loyalty_redemptions_status_check;
  end if;
  alter table public.loyalty_redemptions add constraint loyalty_redemptions_status_check
    check (status in ('pending','approved','fulfilled','delivered','cancelled'));
end $$;
