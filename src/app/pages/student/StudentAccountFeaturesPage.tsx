import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, HeartPulse, Wallet, Users, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type WalletRow = { balance: number };
type Transaction = { id: string; amount: number; balance_after: number; type: string; description: string | null; created_at: string };
type Dietary = { allergies: string[]; restrictions: string[]; notes: string | null };
type FamilyLink = { id: string; relationship: string | null; active: boolean; student_user_id: string; student?: { full_name: string; email: string } | null };
type WeeklyItem = { id: string; menu_date: string; available: boolean; stock_override: number | null; notes: string | null; product: { name: string; price: number; image_url: string | null } | null };

const fmt = (n: number) => Number(n).toLocaleString('es-CO');
const dayLabel = (date: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00`));

export function StudentAccountFeaturesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletRow>({ balance: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dietary, setDietary] = useState<Dietary>({ allergies: [], restrictions: [], notes: null });
  const [allergies, setAllergies] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [family, setFamily] = useState<FamilyLink[]>([]);
  const [weekly, setWeekly] = useState<WeeklyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDietary, setSavingDietary] = useState(false);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const id = session.session?.user.id;
    if (!id) throw new Error('Sesión no disponible.');
    setUserId(id);
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - today.getDay() + 1);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const [walletRes, txRes, dietaryRes, familyRes, menuRes] = await Promise.all([
      client.from('wallet_accounts').select('balance').eq('user_id', id).maybeSingle(),
      client.from('wallet_transactions').select('id,amount,balance_after,type,description,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(12),
      client.from('student_dietary_profiles').select('allergies,restrictions,notes').eq('student_user_id', id).maybeSingle(),
      client.from('parent_student_links').select('id,relationship,active,student_user_id').eq('parent_user_id', id).eq('active', true),
      client.from('weekly_menu_items').select('id,menu_date,available,stock_override,notes,product:products(name,price,image_url)').gte('menu_date', iso(start)).lte('menu_date', iso(end)).order('menu_date').order('display_order'),
    ]);
    for (const result of [walletRes, txRes, dietaryRes, familyRes, menuRes]) if (result.error) throw result.error;
    setWallet((walletRes.data as WalletRow | null) ?? { balance: 0 });
    setTransactions((txRes.data ?? []) as Transaction[]);
    const d = (dietaryRes.data as Dietary | null) ?? { allergies: [], restrictions: [], notes: null };
    setDietary(d); setAllergies(d.allergies.join(', ')); setRestrictions(d.restrictions.join(', ')); setNotes(d.notes ?? '');
    const links = (familyRes.data ?? []) as FamilyLink[];
    if (links.length) {
      const ids = links.map((link) => link.student_user_id);
      const { data: profiles, error } = await client.from('profiles').select('id,full_name,email').in('id', ids);
      if (error) throw error;
      setFamily(links.map((link) => ({ ...link, student: (profiles ?? []).find((p) => p.id === link.student_user_id) ?? null })));
    } else setFamily([]);
    setWeekly((menuRes.data ?? []) as unknown as WeeklyItem[]);
  }, []);

  useEffect(() => { void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las funciones.')).finally(() => setLoading(false)); }, [load]);

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
      toast.success('Perfil alimentario actualizado.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el perfil.'); }
    finally { setSavingDietary(false); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Cargando funciones…</div>;
  const grouped = weekly.reduce<Record<string, WeeklyItem[]>>((acc, item) => { (acc[item.menu_date] ??= []).push(item); return acc; }, {});

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.12),_transparent_35%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between"><Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Funciones</Link><button onClick={() => void load()} className="rounded-full bg-white/80 p-3 shadow-sm" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button></header>
      <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite</p><h1 className="text-3xl font-black">Mi cuenta y planificación</h1><p className="mt-1 text-sm text-slate-600">Saldo, preferencias alimentarias, familia y menú semanal en un solo lugar.</p></div>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><Wallet className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Billetera</h2><p className="text-sm text-slate-600">Saldo y movimientos registrados de forma segura.</p></div></div><p className="mt-5 text-4xl font-black text-emerald-700">${fmt(wallet.balance)}</p><div className="mt-4 space-y-2">{transactions.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no hay movimientos.</p> : transactions.map((tx) => <div key={tx.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm"><div><p className="font-bold">{tx.description ?? tx.type}</p><p className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleString('es-CO')}</p></div><div className="text-right"><p className={`font-black ${Number(tx.amount) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{Number(tx.amount) >= 0 ? '+' : ''}${fmt(Number(tx.amount))}</p><p className="text-xs text-slate-500">Saldo ${fmt(Number(tx.balance_after))}</p></div></div>)}</div></section>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-600"/><div><h2 className="font-black">Alergias y restricciones</h2><p className="text-sm text-slate-600">Guarda información que la cafetería debe tener en cuenta.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Alergias<input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej.: maní, leche" className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-200"/></label><label className="text-sm font-bold">Restricciones<input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Ej.: vegetariano" className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-200"/></label></div><label className="mt-4 block text-sm font-bold">Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-200"/></label><button disabled={savingDietary} onClick={() => void saveDietary()} className="mt-4 rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{savingDietary ? 'Guardando…' : 'Guardar preferencias'}</button><div className="mt-4 flex flex-wrap gap-2">{dietary.allergies.map((item) => <span key={`a-${item}`} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">⚠ {item}</span>)}{dietary.restrictions.map((item) => <span key={`r-${item}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{item}</span>)}</div></section>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><Users className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Estudiantes vinculados</h2><p className="text-sm text-slate-600">Perfiles asociados a esta cuenta mediante los vínculos autorizados.</p></div></div>{family.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No hay estudiantes vinculados a esta cuenta.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{family.map((link) => <div key={link.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-black">{link.student?.full_name ?? 'Estudiante'}</p><p className="text-sm text-slate-600">{link.student?.email ?? ''}</p><p className="mt-2 text-xs font-bold uppercase tracking-wide text-blue-700">{link.relationship ?? 'Vínculo activo'}</p></div>)}</div>}</section>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Menú de la semana</h2><p className="text-sm text-slate-600">Planificación publicada por la cafetería.</p></div></div>{Object.keys(grouped).length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">La cafetería aún no ha publicado el menú semanal.</p> : <div className="mt-5 space-y-4">{Object.entries(grouped).map(([date, items]) => <div key={date} className="rounded-2xl border border-slate-100 bg-white/70 p-4"><p className="font-black capitalize">{dayLabel(date)}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><img src={item.product?.image_url ?? ''} alt="" className="h-14 w-14 rounded-xl object-cover"/><div><p className="font-bold">{item.product?.name ?? 'Producto'}</p><p className="text-sm text-emerald-700">${fmt(Number(item.product?.price ?? 0))}</p><p className="text-xs text-slate-500">{item.available ? `Disponible${item.stock_override != null ? ` · ${item.stock_override} unidades` : ''}` : 'No disponible'}{item.notes ? ` · ${item.notes}` : ''}</p></div></div>)}</div></div>)}</div>}</section>
    </div>
  </div>;
}
