import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, LogOut, Link2, RefreshCw, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { requireSupabaseClient } from '../../lib/supabase';
import { useStudentContextStore, type ActingStudent } from '../../store/studentContextStore';

interface LinkedStudent { id: string; student_user_id: string; relationship: string | null; active: boolean; created_at: string; student?: ActingStudent | null; }

function getLinkErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/student_parent_limit_reached/i.test(message)) return 'Este estudiante ya tiene el máximo de 2 padres o acudientes vinculados.';
  if (/parent_child_limit_reached/i.test(message)) return 'Tu cuenta ya tiene el máximo de 4 estudiantes vinculados.';
  if (/invalid_or_expired_student_code/i.test(message)) return 'El código no existe, ya fue utilizado o está vencido.';
  if (/parent_role_required/i.test(message)) return 'La cuenta actual no tiene permisos de Padre de Familia.';
  if (/student_not_linked/i.test(message)) return 'Ese estudiante ya no está vinculado a tu cuenta.';
  return message || 'No se pudo completar la operación.';
}

export function ParentFamilyPage() {
  const navigate = useNavigate();
  const setActiveStudent = useStudentContextStore((state) => state.setActiveStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState('Padre/Madre');
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enteringStudentId, setEnteringStudentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session.session?.user) { navigate('/'); return; }
    const { data, error } = await client.from('parent_student_links').select('id,student_user_id,relationship,active,created_at,student:profiles!parent_student_links_student_user_id_fkey(id,full_name,email,grade,ti)').eq('parent_user_id', session.session.user.id).eq('active', true).order('created_at', { ascending: false });
    if (error) throw error;
    setStudents((data ?? []) as unknown as LinkedStudent[]);
  }, [navigate]);

  useEffect(() => { void load().catch((error) => toast.error(getLinkErrorMessage(error))).finally(() => setLoading(false)); }, [load]);

  const link = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return toast.error('Ingresa el código del estudiante.');
    if (students.length >= 4) return toast.error('Has alcanzado el máximo de 4 estudiantes vinculados.');
    setSaving(true);
    try {
      const { error } = await requireSupabaseClient().rpc('link_parent_to_student', { p_student_code: normalized, p_relationship: relationship });
      if (error) throw error;
      setCode('');
      toast.success('Estudiante vinculado correctamente.');
      await load();
    } catch (error) { toast.error(getLinkErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const enterStudent = async (student: ActingStudent) => {
    if (enteringStudentId) return;
    setEnteringStudentId(student.id);
    try {
      const client = requireSupabaseClient();
      const { data, error } = await client.rpc('set_parent_active_student', { p_student_user_id: student.id });
      if (error) throw error;
      if (data !== student.id) throw new Error('No se pudo activar el estudiante seleccionado.');
      setActiveStudent(student);
      toast.success(`Entraste al entorno de ${student.full_name}.`);
      navigate('/menu');
    } catch (error) {
      toast.error(getLinkErrorMessage(error));
    } finally { setEnteringStudentId(null); }
  };

  const returnToParent = async () => {
    try {
      await requireSupabaseClient().rpc('clear_parent_active_student');
    } catch (error) {
      toast.error(getLinkErrorMessage(error));
      return;
    }
    clearActiveStudent();
    navigate('/parent/family');
  };

  const logout = async () => {
    await returnToParent();
    await requireSupabaseClient().auth.signOut();
  };
  const parentLimitReached = students.length >= 4;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,.14),_transparent_40%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-3xl space-y-6"><header className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">QuickBite Family</p><h1 className="mt-1 text-3xl font-black">Mi familia</h1><p className="mt-1 text-sm text-slate-600">Vincula los perfiles de tus estudiantes y entra a su entorno cuando lo necesites.</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => void returnToParent()} disabled={!activeStudent}>Panel padre</Button><button type="button" onClick={() => void logout()} className="rounded-full bg-white p-3 shadow-sm" aria-label="Cerrar sesión"><LogOut className="h-4 w-4"/></button></div></header><section className="rounded-[2rem] bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-start gap-3"><Link2 className="mt-1 h-5 w-5 text-blue-700"/><div><h2 className="font-black">Vincular estudiante</h2><p className="mt-1 text-sm text-slate-600">El estudiante debe darte su código desde QuickBite. El vínculo permite administrar su experiencia desde tu cuenta, sin cerrar tu sesión de padre.</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-1 ${parentLimitReached ? 'bg-rose-100 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>Estudiantes vinculados: {students.length}/4</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Cada estudiante puede tener hasta 2 padres/acudientes</span></div>{parentLimitReached && <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4"/>Ya alcanzaste el máximo de 4 estudiantes.</div>}<div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código del estudiante" maxLength={32} disabled={parentLimitReached}/><Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Relación" disabled={parentLimitReached}/><Button type="button" onClick={() => void link()} disabled={saving || parentLimitReached} className="bg-blue-600 font-black text-white hover:bg-blue-700">{saving ? 'Vinculando…' : 'Vincular'}</Button></div></section><section className="rounded-[2rem] bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><h2 className="font-black">Estudiantes vinculados</h2><p className="text-sm text-slate-600">Selecciona un estudiante para entrar a su experiencia completa.</p></div><button type="button" onClick={() => void load()} className="rounded-full bg-slate-100 p-3" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Cargando…</p> : students.length === 0 ? <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-center"><Users className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-2 font-bold">Aún no tienes estudiantes vinculados.</p></div> : <div className="mt-5 grid gap-3">{students.map((linkRow) => <article key={linkRow.id} className={`rounded-2xl border p-4 ${activeStudent?.id === linkRow.student_user_id ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white/70'}`}><div className="flex items-center justify-between gap-4"><div><p className="font-black">{linkRow.student?.full_name ?? 'Estudiante'}</p><p className="mt-1 text-sm text-slate-500">{linkRow.student?.email ?? ''}{linkRow.student?.grade ? ` · ${linkRow.student.grade}` : ''}</p><span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{linkRow.relationship ?? 'Acudiente'}</span></div><Button type="button" onClick={() => linkRow.student && void enterStudent(linkRow.student)} disabled={!linkRow.student || enteringStudentId === linkRow.student_user_id} className="shrink-0 bg-emerald-600 font-black text-white hover:bg-emerald-700"><ArrowRight className="mr-2 h-4 w-4"/>{enteringStudentId === linkRow.student_user_id ? 'Entrando…' : 'Entrar'}</Button></div></article>)}</div>}</section></div></div>;
}
