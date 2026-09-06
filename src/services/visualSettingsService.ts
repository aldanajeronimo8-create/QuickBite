import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseClient } from '../lib/supabase';
import { DEFAULT_VISUAL_SETTINGS, sanitizeVisualSettings, type VisualSettings, type VisualSettingsDraft } from '../types/visualSettings';

const TABLE = 'app_visual_settings';
const BRANDING_BUCKET = 'quickbite-branding';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);

function databasePayload(draft: VisualSettingsDraft) {
  const payload = sanitizeVisualSettings(draft) as Omit<VisualSettingsDraft, 'element_overrides'> & { element_overrides?: VisualSettingsDraft['element_overrides'] };
  delete payload.element_overrides;
  return payload;
}

export async function loadVisualSettings(client: SupabaseClient = requireSupabaseClient()): Promise<VisualSettings> {
  const { data, error } = await client.from(TABLE).select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  const draft = sanitizeVisualSettings((data ?? {}) as Partial<VisualSettingsDraft>);
  return { ...draft, id: true, updated_at: typeof data?.updated_at === 'string' ? data.updated_at : new Date(0).toISOString(), updated_by: typeof data?.updated_by === 'string' ? data.updated_by : null };
}

export async function saveVisualSettings(draft: VisualSettingsDraft, client: SupabaseClient = requireSupabaseClient()): Promise<VisualSettings> {
  const safe = sanitizeVisualSettings(draft);
  const payload = databasePayload(safe);
  const { data, error } = await client.from(TABLE).update(payload).eq('id', true).select('*').single();
  if (error) throw error;
  const saved = sanitizeVisualSettings((data ?? safe) as Partial<VisualSettingsDraft>);
  return { ...saved, id: true, updated_at: typeof data?.updated_at === 'string' ? data.updated_at : new Date().toISOString(), updated_by: typeof data?.updated_by === 'string' ? data.updated_by : null };
}

export async function uploadBrandingImage(file: File, client: SupabaseClient = requireSupabaseClient()): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Formato de imagen no permitido. Usa PNG, JPG, WEBP o ICO.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen supera el límite de 2 MB.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon' ? 'ico' : 'jpg';
  const path = `branding/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(BRANDING_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = client.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error('No se pudo obtener la URL pública de la imagen.');
  return data.publicUrl;
}

export async function resetVisualSettings(client: SupabaseClient = requireSupabaseClient()): Promise<VisualSettings> {
  return saveVisualSettings(DEFAULT_VISUAL_SETTINGS, client);
}
