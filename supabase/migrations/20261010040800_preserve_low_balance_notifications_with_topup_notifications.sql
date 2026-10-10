alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
 check (type = any (array[
  'order_status',
  'reward_redemption',
  'wallet_topup_approved',
  'wallet_topup_rejected',
  'wallet_low_balance'
 ]::text[]));