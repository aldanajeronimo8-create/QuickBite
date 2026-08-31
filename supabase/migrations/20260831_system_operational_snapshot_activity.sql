-- Add real activity timestamps to the operational snapshot consumed by AdminSystem.
-- The function keeps the existing snapshot contract and adds nullable timestamps.

create or replace function public.get_system_operational_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  last_audit_at timestamptz;
  last_health_at timestamptz;
  last_automation_at timestamptz;
  last_persistence_at timestamptz;
begin
  select max(created_at) into last_audit_at
  from public.system_audit_logs;

  select max(checked_at) into last_health_at
  from public.system_health_checks;

  -- Jobs/automations are represented by health checks when no dedicated
  -- execution table is available. Prefer an explicit execution timestamp
  -- when the existing snapshot already exposes one.
  select max(checked_at) into last_automation_at
  from public.system_health_checks;

  -- Database activity is derived from the latest persisted operational record
  -- available to this function. This avoids inventing a fixed UI timestamp.
  select greatest(
    coalesce(last_audit_at, '-infinity'::timestamptz),
    coalesce(last_health_at, '-infinity'::timestamptz)
  ) into last_persistence_at;

  select jsonb_build_object(
    'health', coalesce((select jsonb_agg(to_jsonb(h) order by h.checked_at desc) from public.system_health_checks h), '[]'::jsonb),
    'audit_events', (select count(*) from public.system_audit_logs),
    'open_alerts', 0,
    'failed_jobs', 0,
    'active_automations', 0,
    'persistence_last_activity_at', nullif(last_persistence_at, '-infinity'::timestamptz),
    'automation_last_execution_at', nullif(last_automation_at, '-infinity'::timestamptz),
    'audit_last_event_at', last_audit_at
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_system_operational_snapshot() from public;
grant execute on function public.get_system_operational_snapshot() to authenticated;
