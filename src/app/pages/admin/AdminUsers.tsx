import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Edit2, KeyRound, Plus, Trash2, UserCog, X, ShieldCheck } from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import { useAuthStore } from '../../../store/authStore';
import { requireSupabaseClient, type Profile } from '../../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { listProtectedAdminEmails } from '../../../repositories/quickbiteRepository';
import { protectedAdminEmails } from '../../../lib/protectedAccounts';

type UserForm = { id?: string; email: string; password: string; full_name: string; role: Profile['role']; ti: string };
type StudentConsent = { user_id: string; student_name: string; guardian_name: string; guardian_relationship: string; guardian_email: string; student_acknowledged: boolean; guardian_authorized: boolean; privacy_policy_version: string; consent_at: string };
const emptyForm: UserForm = { email: '', password: '', full_name: '', role: 'student', ti: '' };

export function AdminUsers() {
  const { users, addUser, updateUser, updateProtectedCredentials, deleteUser } = useDataStore();
  const currentUser = useAuthStore((state) => state.user);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credentialOnly, setCredentialOnly] = useState(false);
  const [protectedOriginalEmail, setProtectedOriginalEmail] = useState<string | null>(null);
  const [protectedEmails, setProtectedEmails] = useState<Set<string>>(() => new Set(protectedAdminEmails));
  const [consents, setConsents] = useState<Record<string, StudentConsent>>({});

  const loadConsents = async () => {
    try {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.from('student_data_consents').select('user_id,student_name,guardian_name,guardian_relationship,guardian_email,student_acknowledged,guardian_authorized,privacy_policy_version,consent_at').order('consent_at', { ascending: false });
      if (error) throw error;
      const next: Record<string, StudentConsent> = {};
      for (const row of (data ?? []) as StudentConsent[]) if (!next[row.user_id]) next[row.user_id] = row;
      setConsents(next);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las autorizaciones de datos'); }
  };

  useEffect(() => {
    let active = true;
    void listProtectedAdminEmails().then((emails) => { if (active) setProtectedEmails(new Set(emails)); }).catch(() => undefined);
    void loadConsents();
    return () => { active = false; };
  }, []);

  const isProtected = (user: Profile) => protectedEmails.has(user.email.trim().toLowerCase());
  const isAdministrativeRole = (role: Profile['role']) => role === 'admin' || role === 'both';
  const canCurrentAdminChangeAdministrativeUser = (user: Profile) => {
    if (!currentUser || !isAdministrativeRole(currentUser.role) || !isAdministrativeRole(user.role)) return false;
    return currentUser.id !== user.id;
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      const consent = consents[user.id];
      return `${user.full_name} ${user.email} ${user.role} ${user.ti ?? ''} ${consent?.guardian_name ?? ''} ${consent?.guardian_email ?? ''}`.toLowerCase().includes(needle);
    });
  }, [query, users, consents]);

  const beginCreate = () => { setForm(emptyForm); setCredentialOnly(false); setProtectedOriginalEmail(null); setOpen(true); };
  const beginEdit = (user: Profile) => {
    if (isAdministrativeRole(user.role) && user.id === currentUser?.id) { toast.error('Un administrador no puede cambiar ni restablecer su propia contraseña. Otro administrador debe hacerlo.'); return; }
    const protectedAccount = isProtected(user);
    setForm({ id: user.id, email: user.email, password: '', full_name: user.full_name, role: user.role, ti: user.ti ?? '' });
    setCredentialOnly(protectedAccount); setProtectedOriginalEmail(protectedAccount ? user.email.trim().toLowerCase() : null); setOpen(true);
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { toast.error('Nombre y correo son obligatorios'); return; }
    if (!form.id && form.password.length < 6) { toast.error('La contraseña temporal debe tener al menos 6 caracteres'); return; }
    if (form.id && form.password.trim() && form.password.length < 6) { toast.error('La nueva contraseña debe tener al menos 6 caracteres'); return; }

    const existingUser = form.id ? users.find((user) => user.id === form.id) : null;
    if (form.id && !existingUser) { toast.error('Usuario no encontrado'); return; }
    const effectiveRole = existingUser?.role ?? form.role;
    if (form.id && isAdministrativeRole(effectiveRole) && existingUser) {
      if (!canCurrentAdminChangeAdministrativeUser(existingUser)) { toast.error('Solo otro administrador puede cambiar la contraseña de una cuenta administrativa.'); return; }
      if (!form.password.trim()) { toast.error('Para una cuenta administrativa, el cambio debe incluir una nueva contraseña.'); return; }
    }

    setSaving(true);
    try {
      if (form.id && credentialOnly) {
        await updateProtectedCredentials({ id: form.id, email: form.email.trim().toLowerCase(), password: form.password.trim() || undefined });
        if (protectedOriginalEmail) setProtectedEmails((current) => { const next = new Set(current); next.delete(protectedOriginalEmail); next.add(form.email.trim().toLowerCase()); return next; });
        toast.success('Credenciales de la cuenta protegida actualizadas en Supabase');
      } else if (form.id) {
        await updateUser({ id: form.id, email: form.email.trim().toLowerCase(), full_name: form.full_name.trim(), role: form.role, ti: form.role === 'admin' ? '' : form.ti.trim(), password: form.password.trim() || undefined });
        toast.success('Usuario actualizado en Supabase');
      } else {
        await addUser({ email: form.email.trim().toLowerCase(), password: form.password, full_name: form.full_name.trim(), role: form.role, ti: form.role === 'admin' ? '' : form.ti.trim() });
        toast.success('Usuario creado en Supabase');
      }
      setOpen(false); setForm(emptyForm); setCredentialOnly(false); setProtectedOriginalEmail(null); await loadConsents();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el usuario'); }
    finally { setSaving(false); }
  };

  const removeUser = async (user: Profile) => {
    if (isProtected(user)) { toast.error('Esta cuenta está protegida y no se puede eliminar.'); return; }
    if (!window.confirm(`Eliminar definitivamente a ${user.email}? Se quitará su acceso y sus datos personales; los pedidos quedarán anonimizados en el historial.`)) return;
    try { await deleteUser(user.id); toast.success('Usuario eliminado en Supabase'); await loadConsents(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el usuario'); }
  };

  return (<div>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900"><UserCog className="h-8 w-8 text-blue-600" />Usuarios</h1><p className="mt-1 text-gray-500">Gestiona administradores, estudiantes y la autorización de datos registrada en Supabase.</p></div><Button onClick={beginCreate} className="bg-blue-700 text-white hover:bg-blue-800"><Plus className="mr-2 h-4 w-4" />Crear usuario</Button></div>
    <Card className="mb-5 border-0 bg-white p-4 shadow-sm"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, correo, rol, TI o representante" /></Card>
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">TI</th><th className="px-4 py-3">Representante</th><th className="px-4 py-3">Parentesco</th><th className="px-4 py-3">Correo representante</th><th className="px-4 py-3">Autorización</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((user) => { const consent = consents[user.id]; return <tr key={user.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-semibold text-gray-900">{user.full_name}</td><td className="px-4 py-3 text-gray-600">{user.email}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{user.role}</span></td><td className="px-4 py-3 text-gray-600">{user.ti || '-'}</td><td className="px-4 py-3 text-gray-700">{consent?.guardian_name || '-'}</td><td className="px-4 py-3 text-gray-600">{consent?.guardian_relationship || '-'}</td><td className="px-4 py-3 text-gray-600">{consent?.guardian_email || '-'}</td><td className="px-4 py-3">{consent ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Autorizada · {consent.privacy_policy_version}</span> : <span className="text-xs text-slate-400">Sin registro</span>}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{isProtected(user) ? <><Button variant="outline" size="sm" onClick={() => beginEdit(user)} aria-label={`Editar credenciales de ${user.full_name}`} className="border-amber-200 text-amber-800 hover:bg-amber-50"><KeyRound className="h-4 w-4" /></Button><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">Protegida</span></> : user.id === currentUser?.id && isAdministrativeRole(user.role) ? <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">Contraseña gestionada por otro admin</span> : <><Button variant="outline" size="sm" onClick={() => beginEdit(user)} aria-label={`Editar ${user.full_name}`}><Edit2 className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => removeUser(user)} className="border-red-200 text-red-600 hover:bg-red-50" aria-label={`Eliminar ${user.full_name}`}><Trash2 className="h-4 w-4" /></Button></>}</div></td></tr>; })}{filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No hay usuarios para mostrar.</td></tr>}</tbody></table></div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><Card className="w-full max-w-lg border-0 bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-gray-900">{credentialOnly ? 'Editar credenciales protegidas' : form.id ? 'Editar usuario' : 'Crear usuario'}</h2>{credentialOnly && <p className="mt-1 text-sm text-gray-500">Solo otro administrador puede cambiar las credenciales de una cuenta protegida.</p>}</div><button onClick={() => setOpen(false)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><form onSubmit={saveUser} className="space-y-4">{!credentialOnly && <div><Label>Nombre completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>}<div><Label>Correo</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div><Label>{form.id ? 'Nueva contraseña opcional' : 'Contraseña temporal'}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? 'Dejar vacío para conservar la actual' : 'Mínimo 6 caracteres'} /></div>{!credentialOnly && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><Label>Rol</Label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Profile['role'] })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="student">Estudiante</option><option value="admin">Admin</option><option value="both">Admin y estudiante</option></select></div><div><Label>TI</Label><Input value={form.ti} onChange={(e) => setForm({ ...form, ti: e.target.value })} disabled={form.role === 'admin'} /></div></div>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-blue-700 text-white hover:bg-blue-800">{saving ? 'Guardando...' : 'Guardar'}</Button></div></form></Card></div>}
  </div>);
}
