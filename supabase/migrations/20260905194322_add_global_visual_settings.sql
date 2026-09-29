create table if not exists public.app_visual_settings (
  id boolean primary key default true check (id),
  app_name text not null default 'QuickBite' check (char_length(trim(app_name)) between 1 and 60),
  logo_url text,
  favicon_url text,
  login_logo_url text,
  primary_color text not null default '#16A36A',
  secondary_color text not null default '#2563EB',
  accent_color text not null default '#14B8A6',
  background_color text not null default '#F5F8F7',
  surface_color text not null default '#FFFFFF',
  text_color text not null default '#0F172A',
  muted_text_color text not null default '#64748B',
  border_color text not null default '#E2E8F0',
  success_color text not null default '#16A36A',
  warning_color text not null default '#D97706',
  danger_color text not null default '#DC2626',
  font_family text not null default 'Nunito',
  heading_font text not null default 'Nunito',
  border_radius text not null default 'medium',
  card_radius text not null default 'large',
  button_radius text not null default 'medium',
  shadow_style text not null default 'subtle',
  button_style text not null default 'solid',
  header_style text not null default 'standard',
  navigation_style text not null default 'solid',
  card_style text not null default 'elevated',
  input_style text not null default 'outlined',
  density text not null default 'normal',
  theme_mode text not null default 'light',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint app_visual_settings_colors_check check (
    primary_color ~ '^#[0-9A-Fa-f]{6}$' and secondary_color ~ '^#[0-9A-Fa-f]{6}$' and accent_color ~ '^#[0-9A-Fa-f]{6}$' and
    background_color ~ '^#[0-9A-Fa-f]{6}$' and surface_color ~ '^#[0-9A-Fa-f]{6}$' and text_color ~ '^#[0-9A-Fa-f]{6}$' and
    muted_text_color ~ '^#[0-9A-Fa-f]{6}$' and border_color ~ '^#[0-9A-Fa-f]{6}$' and success_color ~ '^#[0-9A-Fa-f]{6}$' and
    warning_color ~ '^#[0-9A-Fa-f]{6}$' and danger_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint app_visual_settings_font_check check (font_family in ('Nunito','Inter','Poppins','Roboto','system-ui') and heading_font in ('Nunito','Inter','Poppins','Roboto','system-ui')),
  constraint app_visual_settings_radius_check check (border_radius in ('sharp','small','medium','large','rounded') and card_radius in ('sharp','small','medium','large','rounded') and button_radius in ('sharp','small','medium','large','rounded')),
  constraint app_visual_settings_style_check check (shadow_style in ('none','subtle','normal','elevated') and button_style in ('solid','soft','outline','ghost') and header_style in ('standard','minimal','prominent') and navigation_style in ('solid','soft','glass') and card_style in ('flat','outlined','elevated','glass') and input_style in ('outlined','soft','filled')),
  constraint app_visual_settings_density_check check (density in ('compact','normal','comfortable')),
  constraint app_visual_settings_theme_check check (theme_mode in ('light','dark','system'))
);

insert into public.app_visual_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_visual_settings enable row level security;

drop policy if exists "visual_settings_public_read" on public.app_visual_settings;
create policy "visual_settings_public_read" on public.app_visual_settings for select to anon, authenticated using (true);

drop policy if exists "visual_settings_admin_insert" on public.app_visual_settings;
create policy "visual_settings_admin_insert" on public.app_visual_settings for insert to authenticated with check (public.is_admin());

drop policy if exists "visual_settings_admin_update" on public.app_visual_settings;
create policy "visual_settings_admin_update" on public.app_visual_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "visual_settings_admin_delete" on public.app_visual_settings;
create policy "visual_settings_admin_delete" on public.app_visual_settings for delete to authenticated using (public.is_admin());

create or replace function public.set_app_visual_settings_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists app_visual_settings_updated_at on public.app_visual_settings;
create trigger app_visual_settings_updated_at before update on public.app_visual_settings for each row execute function public.set_app_visual_settings_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quickbite-branding', 'quickbite-branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "quickbite_branding_public_read" on storage.objects;
create policy "quickbite_branding_public_read" on storage.objects for select to anon, authenticated using (bucket_id = 'quickbite-branding');

drop policy if exists "quickbite_branding_admin_insert" on storage.objects;
create policy "quickbite_branding_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = 'quickbite-branding' and public.is_admin());

drop policy if exists "quickbite_branding_admin_update" on storage.objects;
create policy "quickbite_branding_admin_update" on storage.objects for update to authenticated using (bucket_id = 'quickbite-branding' and public.is_admin()) with check (bucket_id = 'quickbite-branding' and public.is_admin());

drop policy if exists "quickbite_branding_admin_delete" on storage.objects;
create policy "quickbite_branding_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'quickbite-branding' and public.is_admin());
