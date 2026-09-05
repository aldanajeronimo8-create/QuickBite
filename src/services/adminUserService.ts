import { appConfig } from '../config/appConfig';
import { requireSupabaseClient, type Profile } from '../lib/supabase';

export type AdminUserCreateInput = {
  email: string;
  password: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
  student_code?: string;
  relationship?: string;
};

export type AdminUserUpdateInput = {
  id: string;
  email: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
  password?: string;
  student_code?: string;
  relationship?: string;
};

export type ProtectedCredentialsInput = {
  id: string;
  email: string;
  password?: string;
};

function mapAdminUserError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();
  if (message.includes('not_authorized')) return new Error('No tienes permisos de administrador para gestionar usuarios.');
  if (message.includes('invalid_email')) return new Error('Correo electrónico inválido.');
  if (message.includes('email_already_registered')) return new Error('El correo electrónico ya está registrado.');
  if (message.includes('ti_required')) return new Error('La identificación TI es obligatoria para usuarios, administradores y cuentas usuario + padre.');
  if (message.includes('ti_already_registered')) return new Error('La identificación TI ya está registrada.');
  if (message.includes('password_too_short')) return new Error('La contraseña debe tener al menos 6 caracteres.');
  if (message.includes('invalid_role')) return new Error('El tipo de cuenta seleccionado no es válido.');
  if (message.includes('student_code_required_for_parent')) return new Error('Para una cuenta de padre debes introducir el código de verificación de un estudiante.');
  if (message.includes('invalid_or_expired_student_code')) return new Error('El código del estudiante no existe, ya fue utilizado o expiró.');
  if (message.includes('invalid_student_code')) return new Error('El código no corresponde a un estudiante válido.');
  if (message.includes('student_parent_limit_reached')) return new Error('Este estudiante ya tiene el máximo de acudientes vinculados.');
  if (message.includes('parent_child_limit_reached')) return new Error('Esta cuenta de padre ya tiene el máximo de estudiantes vinculados.');
  if (message.includes('invalid_family_link')) return new Error('No puedes vincular una cuenta consigo misma.');
  if (message.includes('cannot_change_own_admin_password')) return new Error('Otro administrador debe cambiar la contraseña de una cuenta administrativa.');
  if (message.includes('cannot_remove_own_admin_access')) return new Error('No puedes quitarte a ti mismo el acceso administrativo.');
  if (message.includes('user_not_found') || message.includes('auth_user_not_found')) return new Error('Usuario no encontrado.');
  return new Error(raw || 'No se pudo completar la operación de usuario.');
}

async function callAdminManageUser(input: AdminUserCreateInput | AdminUserUpdateInput) {
  const { data, error } = await requireSupabaseClient().rpc('admin_manage_user', {
    p_user_id: 'id' in input ? input.id : null,
    p_email: input.email.trim().toLowerCase(),
    p_password: input.password?.trim() || null,
    p_full_name: input.full_name.trim(),
    p_role: input.role,
    p_ti: input.ti?.trim() || null,
    p_student_code: input.student_code?.trim().toUpperCase() || null,
    p_relationship: input.relationship?.trim() || null,
  });
  if (error) throw mapAdminUserError(error);
  if (!data) throw new Error('Supabase no devolvió el usuario gestionado.');
  return { id: String(data), email: input.email.trim().toLowerCase() };
}

export async function createAdminManagedUser(input: AdminUserCreateInput) {
  return callAdminManageUser(input);
}

export async function updateAdminManagedUser(input: AdminUserUpdateInput) {
  return callAdminManageUser(input);
}

function getAdminApiBaseUrl() {
  if (appConfig.apiBaseUrl) return appConfig.apiBaseUrl.replace(/\/$/, '');
  if (appConfig.supabaseUrl) return `${appConfig.supabaseUrl.replace(/\/$/, '')}/functions/v1/server`;
  return '';
}

export async function updateProtectedAdminCredentials(input: ProtectedCredentialsInput) {
  const apiBaseUrl = getAdminApiBaseUrl();
  if (!apiBaseUrl) throw new Error('La gestión segura de usuarios no está configurada.');
  const { data } = await requireSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  const response = await fetch(`${apiBaseUrl}/api/admin/users/update-protected`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; user?: { id: string; email: string } };
  if (!response.ok) throw new Error(body.error || 'No se pudieron actualizar las credenciales protegidas.');
  return body.user;
}
