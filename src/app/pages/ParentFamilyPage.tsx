import { useCallback, useEffect, useState } from 'react';
import { LogOut, Link2, RefreshCw, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { requireSupabaseClient } from '../../lib/supabase';

interface LinkedStudent { id: string; student_user_id: string; relationship: string | null; active: boolean; created_at: string; student?: { full_name: string; email: string; grade: string | null; ti: string | null } | null; }

export function ParentFamilyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState('Padre/Madre');
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session } = await client.auth.getSession();
    if (!session.session?.user) { navigate('/'); return; }
    const { data, error } = await client.from('parent_student_links').select('id,student_user_id,relationship,active,created_at,student:profiles!parent_student_links_student_user_id_fkey(full_name,email,grade,ti)').eq('parent_user_id', session.session.user.id).eq('active', true).order('created_at', { ascending: false });
    if (error) throw error;
    setStudents((data ?? []) as unknown as LinkedStudent[]);
  }, [navigate]);

  useEffect(() => { void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los estudiantes vinculados.')).finally(() => setLoading(false)); }, [load]);

  const link = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return toast.error('Ingresa el código del estudiante.');
    setSaving(true);
    try {
      const { error } = await requireSupabaseClient().rpc('link_parent_to_student', { p_student_code: normalized, p_relationship: relationship });
      if (error) throw error;
      setCode('');
      toast.success('Estudiante vinculado correctamente.');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo vincular el estudiante.'); }
    finally { setSaving(false); }
  };

  const logout = async () => { await requireSupabaseClient().auth.signOut(); navigate('/'); };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,.14),_transparent_40%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-3xl space-y-6"><header className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">QuickBite Family</p><h1 className="mt-1 text-3xl font-black">Mi familia</h1><p className="mt-1 text-sm text-slate-600">Vincula los perfiles de tus estudiantes mediante su código.</p></div><button type="button" onClick={() => void logout()} className="rounded-full bg-white p-3 shadow-sm" aria-label="Cerrar sesión"><LogOut className="h-4 w-4"/></button></header><section className="rounded-[2rem] bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-start gap-3"><Link2 className="mt-1 h-5 w-5 text-blue-700"/><div><h2 className="font-black">Vincular estudiante</h2><p className="mt-1 text-sm text-slate-600">El estudiante debe darte su código desde QuickBite. No compartas códigos con personas no autorizadas.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código del estudiante" maxLength={32} /><Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Relación" /><Button type="button" onClick={() => void link()} disabled={saving} className="bg-blue-600 font-black text-white hover:bg-blue-700">{saving ? 'Vinculando…' : 'Vincular'}</Button></div></section><section className="rounded-[2rem] bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><h2 className="font-black">Estudiantes vinculados</h2><p className="text-sm text-slate-600">Solo aparecen relaciones autorizadas para tu cuenta.</p></div><button type="button" onClick={() => void load()} className="rounded-full bg-slate-100 p-3" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Cargando…</p> : students.length === 0 ? <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-center"><Users className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-2 font-bold">Aún no tienes estudiantes vinculados.</p></div> : <div className="mt-5 grid gap-3">{students.map((link) => <article key={link.id} className="rounded-2xl border border-slate-200 p-4"><p className="font-black">{link.student?.full_name ?? 'Estudiante'}</p><p className="mt-1 text-sm text-slate-500">{link.student?.email ?? ''}{link.student?.grade ? ` · ${link.student.grade}` : ''}</p><span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{link.relationship ?? 'Acudiente'}</span></article>)}</div>}</section></div></div>;
}
