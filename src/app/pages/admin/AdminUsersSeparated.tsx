import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Edit2, GraduationCap, KeyRound, Link2, Plus, RefreshCw, Shield, ShieldCheck, Trash2, UserCog, Users, X } from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import { useAuthStore } from '../../../store/authStore';
import { requireSupabaseClient, type Profile } from '../../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { listProtectedAdminEmails } from '../../../repositories/quickbiteRepository';
import { protectedAdminEmails } from '../../../lib/protectedAccounts';

type Mode = 'student' | 'parent';
type UserForm = { id?: string; email: string; password: string; full_name: string; role: Profile['role']; ti: string; student_code: string; relationship: string };
type Consent = { user_id: string; guardian_name: string; guardian_relationship: string; guardian_email: string; privacy_policy_version: string };
type GeneratedCode = { code: string; expires_at: string; student_name: string };

const CREATE_ROLES: Array<{ value: Profile['role']; label: string; description: string; icon: typeof Users }> = [
  { value: 'student', label: 'Usuario', description: 'Cuenta de estudiante para realizar compras y consultar pedidos.', icon: GraduationCap },
  { value: 'admin', label: 'Administrador', description: 'Cuenta con acceso al panel administrativo.', icon: Shield },
  { value: 'both', label: 'Usuario y administrador', description: 'Cuenta de estudiante con acceso administrativo.', icon: Shield },
];
const RELATIONSHIPS = ['Padre', 'Madre', 'Acudiente', 'Tutor legal', 'Abuelo/a', 'Tío/a', 'Hermano/a', 'Familiar', 'Otro'];
const emptyForm: UserForm = { email: '', password: '', full_name: '', role: 'student', ti: '', student_code: '', relationship: 'Padre' };
const roleLabel = (role: Profile['role']) => {
  if (role === 'admin') return 'Administrador';
  if (role === 'both') return 'Usuario y administrador';
  if (role === 'parent') return 'Padre de familia';
  if (role === 'student_parent') return 'Usuario y padre';
  return 'Usuario';
};
const isAdmin = (role: Profile['role']) => role === 'admin' || role === 'both';
const needsTi = (role: Profile['role']) => role === 'student' || role === 'both' || role === 'student_parent';
const canGenerateCode = (role: Profile['role']) => role === 'student' || role === 'both' || role === 'student_parent';

export function AdminUsersSeparated() {
  const { users, addUser, updateUser, updateProtectedCredentials, deleteUser } = useDataStore();
  const currentUser = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const [mode, setMode] = useState<Mode>('student');
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCode | null>(null);
  const [protectedEmails, setProtectedEmails] = useState<Set<string>>(() => new Set(protectedAdminEmails));
  const [query, setQuery] = useState('');
  const [consents, setConsents] = useState<Record<string, Consent>>({});
  const [credentialOnly, setCredentialOnly] = useState(false);
  const [protectedOriginalEmail, setProtectedOriginalEmail] = useState<string | null>(null);

  const loadConsents = async () => {
    try {
      const { data, error } = await requireSupabaseClient().from('student_data_consents').select('user_id,guardian_name,guardian_relationship,guardian_email,privacy_policy_version').order('consent_at', { ascending: false });
      if (error) throw error;
      const next: Record<string, Consent> = {};
      for (const row of (data ?? []) as Consent[]) if (!next[row.user_id]) next[row.user_id] = row;
      setConsents(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las autorizaciones');
    }
  };

  useEffect(() => {
    if (authLoading || !currentUser) return undefined;
    let active = true;
    void listProtectedAdminEmails().then((emails) => { if (active) setProtectedEmails(new Set(emails)); }).catch(() => undefined);
    void loadConsents();
    return () => { active = false; };
  }, [authLoading, currentUser?.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => `${user.full_name} ${user.email} ${roleLabel(user.role)} ${user.ti ?? ''} ${consents[user.id]?.guardian_name ?? ''} ${consents[user.id]?.guardian_email ?? ''}`.toLowerCase().includes(needle));
  }, [users, query, consents]);

  const isProtected = (user: Profile) => protectedEmails.has(user.email.trim().toLowerCase());

  const beginCreate = (nextMode: Mode) => {
    setMode(nextMode);
    setForm({ ...emptyForm, role: nextMode === 'parent' ? 'parent' : 'student' });
    setGenerated(null);
    setCredentialOnly(false);
    setProtectedOriginalEmail(null);
    setOpen(true);
  };

  const beginEdit = (user: Profile) => {
    if (isAdmin(user.role) && user.id === currentUser?.id) {
      toast.error('Otro administrador debe gestionar tus credenciales administrativas.');
      return;
    }
    const protectedAccount = isProtected(user);
    setMode(user.role === 'parent' ? 'parent' : 'student');
    setForm({ id: user.id, email: user.email, password: '', full_name: user.full_name, role: user.role, ti: user.ti ?? '', student_code: '', relationship: 'Padre' });
    setCredentialOnly(protectedAccount);
    setProtectedOriginalEmail(protectedAccount ? user.email.trim().toLowerCase() : null);
    setGenerated(null);
    setOpen(true);
  };

  const close = () => {
    if (saving || generating) return;
    setOpen(false); setForm(emptyForm); setGenerated(null); setCredentialOnly(false); setProtectedOriginalEmail(null);
  };

  const generateStudentCode = async (studentId: string, forceNew = false) => {
    setGenerating(true);
    try {
      const { data, error } = await requireSupabaseClient().rpc('get_or_create_student_code', { p_force_new: forceNew, p_student_user_id: studentId });
      if (error) throw error;
      const payload = data as { code?: string; expires_at?: string } | null;
      if (!payload?.code) throw new Error('Supabase no devolvió el código.');
      const student = users.find((u) => u.id === studentId);
      setGenerated({ code: payload.code, expires_at: payload.expires_at ?? '', student_name: student?.full_name ?? form.full_name });
      toast.success(forceNew ? 'Nuevo código generado.' : 'Código de vinculación generado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el código');
    } finally { setGenerating(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const name = form.full_name.trim();
    const password = form.password.trim();
    const ti = form.ti.trim();
    const code = form.student_code.trim().toUpperCase();
    if (!name || !email) return toast.error('Nombre y correo son obligatorios');
    if (!form.id && password.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres');
    if (form.id && password && password.length < 6) return toast.error('La nueva contraseña debe tener al menos 6 caracteres');
    if (!credentialOnly && mode === 'student' && needsTi(form.role) && !ti) return toast.error('La identificación TI es obligatoria.');
    if (!credentialOnly && mode === 'parent' && !code && !form.id) return toast.error('Necesitas primero el código generado por el estudiante.');
    if (!credentialOnly && mode === 'parent' && !form.relationship) return toast.error('Selecciona la relación con el estudiante.');

    const existing = form.id ? users.find((u) => u.id === form.id) : null;
    if (form.id && !existing) return toast.error('Usuario no encontrado');
    if (form.id && existing && isAdmin(existing.role) && existing.id === currentUser?.id) return toast.error('No puedes modificar tus propias credenciales administrativas.');

    setSaving(true);
    try {
      if (form.id && credentialOnly) {
        await updateProtectedCredentials({ id: form.id, email, password: password || undefined });
        if (protectedOriginalEmail) setProtectedEmails((current) => { const next = new Set(current); next.delete(protectedOriginalEmail); next.add(email); return next; });
        toast.success('Credenciales actualizadas');
      } else if (form.id) {
        await updateUser({ id: form.id, email, full_name: name, role: form.role, ti: needsTi(form.role) ? ti : '', password: password || undefined, student_code: code || undefined, relationship: form.relationship || undefined } as any);
        toast.success('Usuario actualizado');
      } else {
        await addUser({ email, password, full_name: name, role: mode === 'parent' ? 'parent' : form.role, ti: mode === 'student' ? (needsTi(form.role) ? ti : '') : '', student_code: undefined, relationship: mode === 'parent' ? form.relationship : undefined } as any);
        toast.success(mode === 'parent' ? 'Padre de familia creado y vinculado' : 'Usuario creado');
        await new Promise((resolve) => setTimeout(resolve, 150));
        const { data: created } = await requireSupabaseClient().from('profiles').select('id,full_name,role').eq('email', email).maybeSingle();
        if (mode === 'student' && created && canGenerateCode(created.role)) await generateStudentCode(created.id);
        if (mode === 'parent') close();
      }
      await loadConsents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el usuario');
    } finally { setSaving(false); }
  };

  const remove = async (user: Profile) => {
    if (isProtected(user)) return toast.error('Esta cuenta está protegida.');
    if (!window.confirm(`Eliminar definitivamente a ${user.email}?`)) return;
    try { await deleteUser(user.id); toast.success('Usuario eliminado'); await loadConsents(); } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo eliminar'); }
  };

  const studentRoleEditing = form.role === 'student' || form.role === 'both' || form.role === 'student_parent';
  const displayRole = CREATE_ROLES.find((option) => option.value === form.role) ?? CREATE_ROLES[0];
  const RoleIcon = displayRole.icon;

  return <div>
    <div className="mb-6">
      <div className="flex items-center gap-3"><UserCog className="h-8 w-8 text-blue-600" /><div><h1 className="text-3xl font-bold text-gray-900">Usuarios</h1><p className="mt-1 text-gray-500">Administra usuarios y padres de familia de forma independiente.</p></div></div>
    </div>

    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <button type="button" onClick={() => beginCreate('student')} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md">
        <div className="flex items-start gap-4"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><GraduationCap className="h-6 w-6" /></span><div><h2 className="text-lg font-bold text-slate-900">Crear usuario</h2><p className="mt-1 text-sm leading-5 text-slate-500">Crea la cuenta del estudiante. Al terminar se genera automáticamente su código de vinculación.</p><div className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Link2 className="h-3.5 w-3.5" />Genera código</div></div></div>
      </button>
      <button type="button" onClick={() => beginCreate('parent')} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md">
        <div className="flex items-start gap-4"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Users className="h-6 w-6" /></span><div><h2 className="text-lg font-bold text-slate-900">Crear padre de familia</h2><p className="mt-1 text-sm leading-5 text-slate-500">Crea la cuenta familiar usando el código generado previamente por el estudiante.</p><div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Código obligatorio</div></div></div>
      </button>
    </div>

    <Card className="mb-5 border-0 bg-white p-4 shadow-sm"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, correo, rol, TI o representante" /></Card>
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">TI</th><th className="px-4 py-3">Representante</th><th className="px-4 py-3">Parentesco</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((user) => { const consent = consents[user.id]; return <tr key={user.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-semibold text-gray-900">{user.full_name}</td><td className="px-4 py-3 text-gray-600">{user.email}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{roleLabel(user.role)}</span></td><td className="px-4 py-3 text-gray-600">{user.ti || '-'}</td><td className="px-4 py-3">{consent?.guardian_name || '-'}</td><td className="px-4 py-3">{consent?.guardian_relationship || '-'}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{isProtected(user) ? <Button variant="outline" size="sm" onClick={() => beginEdit(user)}><KeyRound className="h-4 w-4" /></Button> : <><Button variant="outline" size="sm" onClick={() => beginEdit(user)}><Edit2 className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => remove(user)} className="border-red-200 text-red-600"><Trash2 className="h-4 w-4" /></Button></>}</div></td></tr>; })}</tbody></table></div>

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto border-0 bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-gray-900">{credentialOnly ? 'Editar credenciales protegidas' : form.id ? 'Editar usuario' : mode === 'parent' ? 'Crear padre de familia' : 'Crear usuario'}</h2><p className="mt-1 text-sm text-slate-500">{form.id ? 'Modifica los datos de esta cuenta.' : mode === 'parent' ? 'Necesitas el código del estudiante para vincular esta cuenta.' : 'Crea primero la cuenta del estudiante y su código se generará al finalizar.'}</p></div><button type="button" onClick={close} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <form onSubmit={save} className="space-y-4">
        {!credentialOnly && <div><Label>Nombre completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre completo" /></div>}
        <div><Label>Correo electrónico</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" /></div>
        <div><Label>{form.id ? 'Nueva contraseña opcional' : 'Contraseña temporal'}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? 'Dejar vacío para conservarla' : 'Mínimo 6 caracteres'} /></div>

        {!credentialOnly && mode === 'student' && <div><Label>Tipo de cuenta</Label><div className="mt-2 grid gap-2 md:grid-cols-3">{CREATE_ROLES.map((option) => { const Icon = option.icon; const selected = form.role === option.value; return <button type="button" key={option.value} onClick={() => setForm({ ...form, role: option.value })} className={`rounded-xl border p-3 text-left ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}><Icon className="mb-2 h-5 w-5 text-blue-700" /><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></button>; })}</div></div>}
        {!credentialOnly && mode === 'parent' && <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-emerald-700" /><div><p className="font-bold text-slate-900">Vincular al estudiante</p><p className="text-xs text-slate-600">Usa el código generado desde la cuenta del estudiante.</p></div></div><div className="grid gap-4 md:grid-cols-2"><div><Label>Código del estudiante</Label><Input value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value.toUpperCase() })} placeholder="QB-XXXXXXXX" maxLength={11} className="font-mono tracking-wider" /></div><div><Label>Relación</Label><select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div></div></div>}
        {!credentialOnly && mode === 'student' && studentRoleEditing && <div><Label>Identificación TI</Label><Input value={form.ti} onChange={(e) => setForm({ ...form, ti: e.target.value })} placeholder="Número de TI" /></div>}

        {generated && mode === 'student' && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><p className="text-sm font-semibold text-blue-900">Código de vinculación de {generated.student_name}</p><div className="mt-3 flex items-center gap-2"><div className="flex-1 rounded-xl bg-white px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.2em] text-slate-900">{generated.code}</div><Button type="button" variant="outline" size="icon" onClick={() => navigator.clipboard?.writeText(generated.code)} title="Copiar"><Copy className="h-4 w-4" /></Button></div><p className="mt-2 text-xs text-slate-600">Vigente hasta {generated.expires_at ? new Date(generated.expires_at).toLocaleString('es-CO') : 'su uso o expiración'}.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => generateStudentCode(users.find((u) => u.email.toLowerCase() === form.email.toLowerCase())?.id ?? '', true)} disabled={generating}><RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />Nuevo código</Button></div></div>}

        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><RoleIcon className="mr-1 inline h-4 w-4" /><strong>{mode === 'parent' ? 'Padre de familia' : displayRole.label}:</strong> {mode === 'parent' ? 'Cuenta familiar vinculada al estudiante mediante un código vigente.' : displayRole.description}</div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={close}>Cerrar</Button>{!generated && <Button type="submit" disabled={saving || generating} className="bg-blue-700 text-white hover:bg-blue-800">{saving ? 'Guardando...' : mode === 'parent' ? 'Crear padre y vincular' : 'Crear usuario'}</Button>}</div>
      </form>
    </Card></div>}
  </div>;
}
