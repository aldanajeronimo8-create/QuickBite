import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, HeartPulse, History, RefreshCw, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type Order } from '../../../lib/supabase';
import { StudentPasswordSection } from './StudentPasswordSection';

type Dietary = { allergies: string[]; restrictions: string[]; notes: string | null };
type Profile = { full_name: string | null; email: string | null };

const fmt = (n: number) => Number(n).toLocaleString('es-CO');
const statusLabel = (status: Order['status']) => ({ pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo', delivered: 'Entregado', rejected: 'Rechazado', cancelled: 'Cancelado' } as const)[status];
const startOfWeek = () => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + diff); return d; };
const iso = (d: Date) => d.toISOString();

export function StudentAccountFeaturesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ full_name: null, email: null });
  const [dietary, setDietary] = useState<Dietary>({ allergies: [], restrictions: [], notes: null });
  const [allergies, setAllergies] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDietary, setSavingDietary] = useState(false);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const id = session.session?.user.id;
    if (!id) throw new Error('Sesión no disponible.');
    setUserId(id);
    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const [profileRes, dietaryRes, ordersRes] = await Promise.all([
      client.from('profiles').select('full_name,email').eq('id', id).maybeSingle(),
      client.from('student_dietary_profiles').select('allergies,restrictions,notes').eq('student_user_id', id).maybeSingle(),
      client.from('orders').select('*,order_items(*,product:products(name))').eq('user_id', id).gte('created_at', iso(weekStart)).lt('created_at', iso(weekEnd)).order('created_at', { ascending: false }),
    ]);
    for (const result of [profileRes, dietaryRes, ordersRes]) if (result.error) throw result.error;
    setProfile((profileRes.data as Profile | null) ?? { full_name: null, email: session.session?.user.email ?? null });
    const d = (dietaryRes.data as Dietary | null) ?? { allergies: [], restrictions: [], notes: null };
    setDietary(d);
    setAllergies(d.allergies.join(', '));
    setRestrictions(d.restrictions.join(', '));
    setNotes(d.notes ?? '');
    setOrders((ordersRes.data ?? []) as Order[]);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las funciones.')).finally(() => setLoading(false));
  }, [load]);

  const saveDietary = async () => {
    if (!userId) return;
    setSavingDietary(true);
    try {
      const client = requireSupabaseClient();
      const split = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
      const next = { student_user_id: userId, allergies: split(allergies), restrictions: split(restrictions), notes: notes.trim() || null, updated_at: new Date().toISOString() };
      const { error } = await client.from('student_dietary_profiles').upsert(next, { onConflict: 'student_user_id' });
      if (error) throw error;
      setDietary({ allergies: next.allergies, restrictions: next.restrictions, notes: next.notes });
      toast.success('Preferencias alimentarias guardadas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally { setSavingDietary(false); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Cargando funciones…</div>;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.12),_transparent_35%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-center justify-between"><Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Funciones</Link><button type="button" onClick={() => void load()} className="rounded-full bg-white/80 p-3 shadow-sm" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button></header>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite</p><h1 className="text-3xl font-black">Mi cuenta</h1><p className="mt-1 text-sm text-slate-600">Mis datos, contraseña, preferencias alimentarias y pedidos de esta semana.</p></div>
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><UserCircle className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Mis datos</h2><p className="text-sm text-slate-600">Información de tu cuenta actualmente registrada en QuickBite.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Nombre</p><p className="mt-1 font-bold">{profile.full_name || 'Sin nombre registrado'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Correo electrónico</p><p className="mt-1 break-all font-bold">{profile.email || 'Sin correo registrado'}</p></div></div></section>
    {userId && <StudentPasswordSection userId={userId} />}
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-600"/><div><h2 className="font-black">Alergias y restricciones</h2><p className="text-sm text-slate-600">Estos datos se guardan en el perfil alimentario del estudiante.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Alergias<input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej.: maní, leche" className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal"/></label><label className="text-sm font-bold">Restricciones<input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Ej.: vegetariano" className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal"/></label></div><label className="mt-4 block text-sm font-bold">Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal"/></label><button disabled={savingDietary} onClick={() => void saveDietary()} className="mt-4 rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{savingDietary ? 'Guardando…' : 'Guardar preferencias'}</button><div className="mt-4 flex flex-wrap gap-2">{dietary.allergies.map((x) => <span key={`a-${x}`} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">⚠ {x}</span>)}{dietary.restrictions.map((x) => <span key={`r-${x}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{x}</span>)}</div></section>
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><History className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Pedidos de la semana</h2><p className="text-sm text-slate-600">Pedidos realizados de lunes a domingo.</p></div></div>{orders.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No tienes pedidos esta semana.</p> : <div className="mt-5 space-y-3">{orders.map((order) => <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">#{order.order_number}</p><p className="font-black">{statusLabel(order.status)}</p><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString('es-CO')}</p></div><p className="text-lg font-black text-emerald-800">${fmt(Number(order.total))}</p></div><div className="mt-3 flex flex-wrap gap-2">{(order.order_items ?? []).map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.quantity} × {item.product?.name ?? 'Producto'}</span>)}</div></div>)}</div>}</section>
    <div className="flex flex-wrap gap-3"><Link to="/student/wallet" className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white">Saldos y recargas</Link><Link to="/student/features" className="rounded-full bg-white px-5 py-3 text-sm font-black shadow-sm ring-1 ring-slate-200">Centro de funciones</Link></div>
  </div></div>;
}
