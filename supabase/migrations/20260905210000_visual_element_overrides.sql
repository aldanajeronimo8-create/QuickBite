alter table public.app_visual_settings
  add column if not exists interface_overrides jsonb not null default '{}'::jsonb;

alter table public.app_visual_settings
  drop constraint if exists app_visual_settings_interface_overrides_check;

alter table public.app_visual_settings
  add constraint app_visual_settings_interface_overrides_check
  check (jsonb_typeof(interface_overrides) = 'object');
