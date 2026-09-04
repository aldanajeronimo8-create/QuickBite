import { appConfig } from '../config/appConfig';
import { requireSupabaseClient, type Profile } from '../lib/supabase';

export type AdminUserCreateInput = {
  email: string;
  password: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
};

export type AdminUserUpdateInput = {
  id: string;
  email: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
  password?: string;
};

export type ProtectedCredentialsInput = {
  id: string;
  email: string;
  password?: string;
};

function getAdminApiBaseUrl() {
  if (appConfig.apiBaseUrl) return appConfig.apiBaseUrl.replace(/\/$/, '');
  if (appConfig.supabaseUrl) return `${appConfig.supabaseUrl.replace(/\/$/, '')}/functions/v1/server`;
  return '';
}

async function callAdminUserEndpoint<T>(path: string, payload: unknown): Promise<T> {
  const apiBaseUrl = getAdminApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error('La gestión segura de usuarios no está configurada. Verifica la configuración de Supabase.');
  }

  const { data } = await requireSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

  const response = await fetch(`${apiBaseUrl}/api/admin/users/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación de usuario.');
  return body;
}

export async function createAdminManagedUser(input: AdminUserCreateInput) {
  return callAdminUserEndpoint<{ user: { id: string; email: string } }>('create', input);
}

export async function updateAdminManagedUser(input: AdminUserUpdateInput) {
  return callAdminUserEndpoint<{ user: { id: string; email: string } }>('update', input);
}

export async function updateProtectedAdminCredentials(input: ProtectedCredentialsInput) {
  return callAdminUserEndpoint<{ user: { id: string; email: string } }>('update-protected', input);
}
