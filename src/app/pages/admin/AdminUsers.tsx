import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Edit2, KeyRound, Plus, Trash2, UserCog, X, ShieldCheck, Users, GraduationCap, Shield } from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import { useAuthStore } from '../../../store/authStore';
import { requireSupabaseClient, type Profile } from '../../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { listProtectedAdminEmails } from '../../../repositories/quickbiteRepository';
import { protectedAdminEmails } from '../../../lib/protectedAccounts';

type UserForm = { id?: string; email: string; password: string; full_name: string; role: Profile['role']; ti: string; student_code: string; relationship: string };
type StudentConsent = { user_id: string; student_name: string; guardian_name: string; guardian_relationship: string; guardian_email: string; student_acknowledged: boolean; guardian_authorized: boolean; privacy_policy_version: string; consent_at: string };

const ROLE_OPTIONS: Array<{ value: Profile['role']; label: string; description: string; icon: typeof Users }> = [
  { value: 'student', label: 'Usuario', description: 'Cuenta de estudiante para comprar, consultar pedidos y usar las funciones de usuario.', icon: GraduationCap },
  { value: 'admin', label: 'Administrador', description: 'Acceso al panel administrativo y a la gestión del sistema.', icon: Shield },
  { value: 'parent', label: 'Padre de familia', description: 'Cuenta familiar vinculada mediante un código de verificación de un estudiante.', icon: Users },
  { value: 'both', label: 'Usuario y administrador', description: 'Cuenta de estudiante + acceso administrativo.', icon: Shield },
  { value: 'student_parent', label: 'Usuario y padre', description: 'Cuenta de estudiante + cuenta familiar vinculada a otro estudiante.', icon: Users },
];
const RELATIONSHIP_OPTIONS = ['Padre', 'Madre', 'Acudiente', 'Tutor legal', 'Abuelo/a', 'Tío/a', 'Hermano/a', 'Familiar', 'Otro'];
const emptyForm: UserForm = { email: '', password: '', full_name: '', role: 'student', ti: '', student_code: '', relationship: 'Padre' };
const roleLabel = (role: Profile['role']) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
const isAdministrativeRole = (role: Profile['role']) => role === 'admin' || role === 'both';
const needsStudentCode = (role: Profile['role']) => role === 'parent' || role === 'student_parent';
const needsTi = (role: Profile['role']) => role === 'student' || role === 'both' || role === 'student_parent';

export function AdminUsers() {
  const { users, addUser, updateUser, updateProtectedCredentials, deleteUser } = useDataStore();
  const currentUser = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las autorizaciones de datos');
    }
  };

  useEffect(() => {
    if (authLoading || !currentUser) return undefined;
    let active = true;
    void listProtectedAdminEmails().then((emails) => { if (active) setProtectedEmails(new Set(emails)); }).catch(() => undefined);
    void loadConsents();
    return () => { active = false; };
  }, [authLoading, currentUser?.id]);

  const isProtected = (user: Profile) => protectedEmails.has(user.email.trim().toLowerCase());
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      const consent = consents[user.id];
      return `${user.full_name} ${user.email} ${roleLabel(user.role)} ${user.ti ?? ''} ${consent?.guardian_name ?? ''} ${consent?.guardian_email ?? ''}`.toLowerCase().includes(needle);
    });
  }, [query, users, consents]);

  const beginCreate = () => { setForm(emptyForm); setCredentialOnly(false); setProtectedOriginalEmail(null); setOpen(true); };
  const beginEdit = (user: Profile) => {
    if (isAdministrativeRole(user.role) && user.id === currentUser?.id) { toast.error('Un administrador no puede cambiar ni restablecer su propia contraseña. Otro administrador debe hacerlo.'); return; }
    const protectedAccount = isProtected(user);
    setForm({ id: user.id, email: user.email, password: '', full_name: user.full_name, role: user.role, ti: user.ti ?? '', student_code: '', relationship: 'Padre' });
    setCredentialOnly(protectedAccount); setProtectedOriginalEmail(protectedAccount ? user.email.trim().toLowerCase() : null); setOpen(true);
  };
  const closeModal = () => { if (saving) return; setOpen(false); setForm(emptyForm); setCredentialOnly(false); setProtectedOriginalEmail(null); };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const fullName = form.full_name.trim();
    const password = form.password.trim();
    const ti = form.ti.trim();
    const studentCode = form.student_code.trim().toUpperCase();
    if (!fullName || !email) { toast.error('Nombre y correo son obligatorios'); return; }
    if (!form.id && password.length < 6) { toast.error('La contraseña temporal debe tener al menos 6 caracteres'); return; }
    if (form.id && password && password.length < 6) { toast.error('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (!credentialOnly && needsTi(form.role) && !ti) { toast.error('La identificación TI es obligatoria para este tipo de cuenta.'); return; }
    if (!credentialOnly && needsStudentCode(form.role) && !studentCode && !form.id) { toast.error('Este tipo de cuenta requiere el código de verificación de un estudiante.'); return; }
    if (!credentialOnly && needsStudentCode(form.role) && !form.relationship) { toast.error('Selecciona la relación con el estudiante.'); return; }
    const existingUser = form.id ? users.find((user) => user.id === form.id) : null;
    if (form.id && !existingUser) { toast.error('Usuario no encontrado'); return; }
    if (form.id && existingUser && isAdministrativeRole(existingUser.role) && existingUser.id === currentUser?.id) { toast.error('No puedes modificar tus propias credenciales administrativas.'); return; }

    setSaving(true);
    try {
      if (form.id && credentialOnly) {
        await updateProtectedCredentials({ id: form.id, email, password: password || undefined });
        if (protectedOriginalEmail) setProtectedEmails((current) => { const next = new Set(current); next.delete(protectedOriginalEmail); next.add(email); return next; });
        toast.success('Credenciales de la cuenta protegida actualizadas en Supabase');
      } else if (form.id) {
        await updateUser({ id: form.id, email, full_name: fullName, role: form.role, ti: needsTi(form.role) ? ti : '', password: password || undefined, student_code: studentCode || undefined, relationship: form.relationship || undefined } as any);
        toast.success('Usuario actualizado en Supabase');
      } else {
        await addUser({ email, password, full_name: fullName, role: form.role, ti: needsTi(form.role) ? ti : '', student_code: studentCode || undefined, relationship: needsStudentCode(form.role) ? form.relationship : undefined } as any);
        toast.success('Usuario creado en Supabase');
      }
      closeModal(); await loadConsents();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el usuario'); }
    finally { setSaving(false); }
  };

  const removeUser = async (user: Profile) => {
    if (isProtected(user)) { toast.error('Esta cuenta está protegida y no se puede eliminar.'); return; }
    if (!window.confirm(`Eliminar definitivamente a ${user.email}? Se quitará su acceso y sus datos personales; los pedidos quedarán anonimizados en el historial.`)) return;
    try { await deleteUser(user.id); toast.success('Usuario eliminado en Supabase'); await loadConsents(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el usuario'); }
  };

  const selectedRole = ROLE_OPTIONS.find((option) => option.value === form.role) ?? ROLE_OPTIONS[0];
  const RoleIcon = selectedRole.icon;

  return (<div>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900"><UserCog className="h-8 w-8 text-blue-600" />Usuarios</h1><p className="mt-1 text-gray-500">Gestiona cuentas, roles, credenciales y vínculos familiares desde Supabase.</p></div><Button onClick={beginCreate} className="bg-blue-700 text-white hover:bg-blue-800"><Plus className="mr-2 h-4 w-4" />Crear usuario</Button></div>
    <Card className="mb-5 border-0 bg-white p-4 shadow-sm"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, correo, rol, TI o representante" /></Card>
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">TI</th><th className="px-4 py-3">Representante</th><th className="px-4 py-3">Parentesco</th><th className="px-4 py-3">Correo representante</th><th className="px-4 py-3">Autorización</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((user) => { const consent = consents[user.id]; return <tr key={user.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-semibold text-gray-900">{user.full_name}</td><td className="px-4 py-3 text-gray-600">{user.email}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{roleLabel(user.role)}</span></td><td className="px-4 py-3 text-gray-600">{user.ti || '-'}</td><td className="px-4 py-3 text-gray-700">{consent?.guardian_name || '-'}</td><td className="px-4 py-3 text-gray-600">{consent?.guardian_relationship || '-'}</td><td className="px-4 py-3 text-gray-600">{consent?.guardian_email || '-'}</td><td className="px-4 py-3">{consent ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Autorizada · {consent.privacy_policy_version}</span> : <span className="text-xs text-slate-400">Sin registro</span>}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{isProtected(user) ? <><Button variant="outline" size="sm" onClick={() => beginEdit(user)} aria-label={`Editar credenciales de ${user.full_name}`} className="border-amber-200 text-amber-800 hover:bg-amber-50"><KeyRound className="h-4 w-4" /></Button><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">Protegida</span></> : user.id === currentUser?.id && isAdministrativeRole(user.role) ? <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">Gestionada por otro admin</span> : <><Button variant="outline" size="sm" onClick={() => beginEdit(user)} aria-label={`Editar ${user.full_name}`}><Edit2 className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => removeUser(user)} className="border-red-200 text-red-600 hover:bg-red-50" aria-label={`Eliminar ${user.full_name}`}><Trash2 className="h-4 w-4" /></Button></>}</div></td></tr>; })}{filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No hay usuarios para mostrar.</td></tr>}</tbody></table></div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto border-0 bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-gray-900">{credentialOnly ? 'Editar credenciales protegidas' : form.id ? 'Editar usuario' : 'Crear usuario'}</h2>{credentialOnly && <p className="mt-1 text-sm text-gray-500">Solo otro administrador puede cambiar las credenciales de una cuenta protegida.</p>}</div><button onClick={closeModal} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
      <form onSubmit={saveUser} className="space-y-4">
        {!credentialOnly && <div><Label>Nombre completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre completo" /></div>}
        <div><Label>Correo electrónico</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" /></div>
        <div><Label>{form.id ? 'Nueva contraseña opcional' : 'Contraseña temporal'}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? 'Dejar vacío para conservar la actual' : 'Mínimo 6 caracteres'} /></div>
        {!credentialOnly && <>
          <div><Label>Tipo de cuenta</Label><div className="mt-2 grid gap-2">{ROLE_OPTIONS.map((option) => { const Icon = option.icon; const selected = form.role === option.value; return <button key={option.value} type="button" onClick={() => setForm({ ...form, role: option.value })} className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}><span className={`mt-0.5 rounded-lg p-2 ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span></span></button>; })}</div></div>
          {needsTi(form.role) && <div><Label>Identificación TI</Label><Input value={form.ti} onChange={(e) => setForm({ ...form, ti: e.target.value })} placeholder="Número de TI del usuario" /><p className="mt-1 text-xs text-slate-500">Obligatoria porque esta cuenta tendrá acceso como usuario/estudiante.</p></div>}
          {needsStudentCode(form.role) && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700" /><div><p className="font-bold text-slate-900">Vinculación con estudiante</p><p className="text-xs text-slate-600">El código debe ser generado por el estudiante y estar vigente.</p></div></div><div className="grid gap-4 md:grid-cols-2"><div><Label>Código de verificación del estudiante</Label><Input value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value.toUpperCase() })} placeholder="QB-XXXXXXXX" maxLength={11} className="font-mono tracking-wider" /></div><div><Label>Relación con el estudiante</Label><select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{RELATIONSHIP_OPTIONS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></div></div></div>}
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><RoleIcon className="mr-1 inline h-4 w-4" /><strong>{selectedRole.label}:</strong> {selectedRole.description}</div>
        </>}
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={closeModal}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-blue-700 text-white hover:bg-blue-800">{saving ? 'Guardando...' : 'Guardar'}</Button></div>
      </form></Card></div>}
  </div>);
}
