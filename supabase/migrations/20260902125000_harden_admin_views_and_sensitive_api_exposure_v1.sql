-- Harden administrative analytics views: enforce underlying-table RLS and never expose them to anonymous clients.
alter view public.admin_sales_analytics set (security_invoker = true);
alter view public.admin_sales_daily set (security_invoker = true);
alter view public.admin_order_activity set (security_invoker = true);

revoke select on table public.admin_sales_analytics from anon;
revoke select on table public.admin_order_activity from anon;
revoke select on table public.admin_sales_daily from anon;

-- Sensitive/internal data must never be reachable by unauthenticated Data API clients.
revoke select on table public.audit_logs from anon;
revoke select on table public.automation_jobs from anon;
revoke select on table public.automation_settings from anon;
revoke select on table public.daily_summaries from anon;
revoke select on table public.demand_observations from anon;
revoke select on table public.family_link_codes from anon;
revoke select on table public.favorites from anon;
revoke select on table public.loyalty_point_ledger from anon;
revoke select on table public.loyalty_redemptions from anon;
revoke select on table public.loyalty_settings from anon;
revoke select on table public.notifications from anon;
revoke select on table public.order_items from anon;
revoke select on table public.orders from anon;
revoke select on table public.parent_active_student_context from anon;
revoke select on table public.parent_student_links from anon;
revoke select on table public.pickup_slots from anon;
revoke select on table public.product_stock_settings from anon;
revoke select on table public.profiles from anon;
revoke select on table public.report_periods from anon;
revoke select on table public.staff_roles from anon;
revoke select on table public.student_data_consents from anon;
revoke select on table public.student_dietary_profiles from anon;
revoke select on table public.system_alerts from anon;
revoke select on table public.wallet_accounts from anon;
revoke select on table public.wallet_topup_requests from anon;
revoke select on table public.wallet_transactions from anon;

-- Public catalog remains intentionally readable for the student menu experience.
-- categories, products, product_allergens, weekly_menu_items and loyalty_rewards are unchanged.
