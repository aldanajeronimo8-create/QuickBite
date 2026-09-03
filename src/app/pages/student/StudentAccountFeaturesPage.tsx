import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Heart,
  HeartPulse,
  History,
  KeyRound,
  Link2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Star,
  UserCircle,
  Utensils,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type Order } from '../../../lib/supabase';
import { StudentPasswordSection } from './StudentPasswordSection';

type Dietary = { allergies: string[]; restrictions: string[]; notes: string | null };
type Profile = { full_name: string | null; email: string | null };

const fmt = (n: number) => Number(n).toLocaleString('es-CO');
const statusLabel = (status: Order['status']) => ({
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
} as const)[status];
const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
};
const iso = (d: Date) => d.toISOString();
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'No disponible');

function AccountLink({ icon: Icon, title, description, to, tone = 'slate' }: { icon: typeof UserCircle; title: string; description: string; to: string; tone?: 'slate' | 'blue' | 'emerald' | 'violet' | 'amber' }) {
  const toneClasses = {
    slate: 'bg-white ring-slate-200 hover:ring-slate-300',
    blue: 'bg-blue-50/60 ring-blue-100 hover:ring-blue-200',
    emerald: 'bg-emerald-50/60 ring-emerald-100 hover:ring-emerald-200',
    violet: 'bg-violet-50/60 ring-violet-100 hover:ring-violet-200',
    amber: 'bg-amber-50/60 ring-amber-100 hover:ring-amber-200',
  }[tone];
  return <Link to={to} className={`group flex items-center gap-3 rounded-2xl p-4 ring-1 transition hover:-translate-y-0.5 ${toneClasses}`}>
    <Icon className="h-5 w-5 shrink-0 text-slate-700" />
    <span className="min-w-0 flex-1"><span className="block font-black">{title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span>
    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
  </Link>;
}

export function StudentAccountFeaturesPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ full_name: null, email: null });
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [dietary, setDietary] = useState<Dietary>({ allergies: [], restrictions: [], notes: null });
  const [allergies, setAllergies] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDietary, setSavingDietary] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const authUser = session.session?.user;
    const id = authUser?.id;
    if (!id) throw new Error('Sesión no disponible.');
    setUserId(id);
    setLastSignInAt(authUser.last_sign_in_at ?? null);

    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const [profileRes, dietaryRes, ordersRes] = await Promise.all([
      client.from('profiles').select('full_name,email').eq('id', id).maybeSingle(),
      client.from('student_dietary_profiles').select('allergies,restrictions,notes').eq('student_user_id', id).maybeSingle(),
      client.from('orders').select('*,order_items(*,product:products(name))').eq('user_id', id).gte('created_at', iso(weekStart)).lt('created_at', iso(weekEnd)).order('created_at', { ascending: false }),
    ]);
    for (const result of [profileRes, dietaryRes, ordersRes]) if (result.error) throw result.error;
    setProfile((profileRes.data as Profile | null) ?? { full_name: null, email: authUser.email ?? null });
    const d = (dietaryRes.data as Dietary | null) ?? { allergies: [], restrictions: [], notes: null };
    setDietary(d);
    setAllergies(d.allergies.join(', '));
    setRestrictions(d.restrictions.join(', '));
    setNotes(d.notes ?? '');
    setOrders((ordersRes.data ?? []) as Order[]);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudo cargar Mi cuenta.')).finally(() => setLoading(false));
  }, [load]);

  const saveDietary = async () => {
    if (!userId) return;
    setSavingDietary(true);
    try {
      const client = requireSupabaseClient();
      const split = (value: string) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
      const next = { student_user_id: userId, allergies: split(allergies), restrictions: split(restrictions), notes: notes.trim() || null, updated_at: new Date().toISOString() };
      const { error } = await client.from('student_dietary_profiles').upsert(next, { onConflict: 'student_user_id' });
      if (error) throw error;
      setDietary({ allergies: next.allergies, restrictions: next.restrictions, notes: next.notes });
      toast.success('Preferencias alimentarias guardadas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el perfil alimentario.');
    } finally {
      setSavingDietary(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await requireSupabaseClient().auth.signOut();
      toast.success('Sesión cerrada correctamente.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.');
    } finally {
      setSigningOut(false);
    }
  };

  const orderTotal = useMemo(() => orders.reduce((sum, order) => sum + Number(order.total), 0), [orders]);
  const activeOrders = useMemo(() => orders.filter((order) => ['pending', 'preparing', 'ready'].includes(order.status)).length, [orders]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Cargando Mi cuenta…</div>;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.1),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm font-black shadow-sm ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4"/>Funciones</Link>
        <button type="button" onClick={() => void load()} className="rounded-full bg-white/85 p-3 shadow-sm ring-1 ring-slate-200" aria-label="Actualizar Mi cuenta"><RefreshCw className="h-4 w-4"/></button>
      </header>

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-2xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"><UserCircle className="h-8 w-8"/></div>
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite Student</p><h1 className="truncate text-3xl font-black">Mi cuenta</h1><p className="mt-1 truncate text-sm text-slate-600">{profile.full_name || 'Estudiante'} · {profile.email || 'Sin correo registrado'}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100"><p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Pedidos semana</p><p className="mt-1 text-xl font-black">{orders.length}</p></div>
            <div className="rounded-2xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100"><p className="text-[11px] font-black uppercase tracking-wide text-blue-700">Activos</p><p className="mt-1 text-xl font-black">{activeOrders}</p></div>
            <div className="col-span-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 sm:col-span-1"><p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Gastado semana</p><p className="mt-1 text-xl font-black">${fmt(orderTotal)}</p></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-3"><UserCircle className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Mi perfil</h2><p className="text-sm text-slate-600">La información principal de tu cuenta.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Nombre</p><p className="mt-1 font-bold">{profile.full_name || 'Sin nombre registrado'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Correo</p><p className="mt-1 break-all font-bold">{profile.email || 'Sin correo registrado'}</p></div></div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-100"><CheckCircle2 className="h-5 w-5 text-emerald-700"/><div><p className="font-black text-emerald-900">Cuenta operativa</p><p className="text-xs text-emerald-800">Tu sesión actual está autenticada correctamente.</p></div></div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Seguridad</h2><p className="text-sm text-slate-600">Controla el acceso a tu cuenta.</p></div></div>
          <div className="mt-4 space-y-3"><div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-blue-700"/><div><p className="font-black">Contraseña</p><p className="text-xs text-slate-500">Se cambia desde el bloque protegido de abajo.</p></div></div><span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-black text-blue-700">Protegida</span></div><div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Clock3 className="h-5 w-5 text-slate-600"/><div><p className="font-black">Último acceso registrado</p><p className="text-xs text-slate-500">{formatDateTime(lastSignInAt)}</p></div></div><div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"/><div><p className="font-black text-emerald-900">Sesión aislada por pestaña</p><p className="text-xs leading-5 text-emerald-800">Tu sesión de Student permanece separada de otras cuentas abiertas en otras pestañas del mismo navegador.</p></div></div></div>
        </div>
      </section>

      {userId && <StudentPasswordSection userId={userId} />}

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-600"/><div><h2 className="font-black">Alimentación y bienestar</h2><p className="text-sm text-slate-600">Personaliza la información alimentaria que QuickBite mantiene para ti.</p></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Alergias<input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej.: maní, leche" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal"/></label><label className="text-sm font-bold">Restricciones<input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Ej.: vegetariano" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal"/></label></div>
        <label className="mt-4 block text-sm font-bold">Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Información adicional relevante para tu perfil alimentario" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal"/></label>
        <button disabled={savingDietary} onClick={() => void saveDietary()} className="mt-4 rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm disabled:bg-slate-300">{savingDietary ? 'Guardando…' : 'Guardar preferencias'}</button>
        <div className="mt-4 flex flex-wrap gap-2">{dietary.allergies.map((x) => <span key={`a-${x}`} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100"><AlertTriangle className="h-3 w-3"/>{x}</span>)}{dietary.restrictions.map((x) => <span key={`r-${x}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100">{x}</span>)}{dietary.allergies.length === 0 && dietary.restrictions.length === 0 && !dietary.notes && <span className="text-xs text-slate-400">Aún no has registrado preferencias alimentarias.</span>}</div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="flex items-center gap-3"><History className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Actividad reciente</h2><p className="text-sm text-slate-600">Resumen de tu actividad de esta semana.</p></div></div><Link to="/student/history" className="text-sm font-black text-blue-700 hover:underline">Ver historial completo</Link></div>
        {orders.length === 0 ? <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No tienes pedidos esta semana.</div> : <div className="mt-5 space-y-3">{orders.slice(0, 4).map((order) => <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">#{order.order_number}</p><p className="font-black">{statusLabel(order.status)}</p><p className="text-xs text-slate-500">{formatDateTime(order.created_at)}</p></div><p className="text-lg font-black text-emerald-800">${fmt(Number(order.total))}</p></div><div className="mt-3 flex flex-wrap gap-2">{(order.order_items ?? []).map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.quantity} × {item.product?.name ?? 'Producto'}</span>)}</div></div>)}</div>}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><Wallet className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Dinero y compras</h2><p className="text-sm text-slate-600">Accesos directos a tus herramientas de compra.</p></div></div><div className="mt-4 space-y-3"><AccountLink icon={CreditCard} title="Saldos y recargas" description="Consulta saldo, recargas, estados, rechazos y movimientos." to="/student/wallet" tone="emerald"/><AccountLink icon={Utensils} title="Menú" description="Consulta disponibilidad y realiza nuevas compras." to="/menu?tab=menu"/><AccountLink icon={Heart} title="Mis favoritos" description="Accede rápidamente a los productos que guardaste." to="/student/favorites"/></div></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><Link2 className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Familia y preferencias</h2><p className="text-sm text-slate-600">Gestiona vínculos y avisos asociados a tu cuenta.</p></div></div><div className="mt-4 space-y-3"><AccountLink icon={Link2} title="Vinculación familiar" description="Genera o consulta el código con el que tu familia puede solicitar un vínculo." to="/student/link-code" tone="blue"/><AccountLink icon={Bell} title="Notificaciones" description="Revisa avisos, novedades y cambios relacionados con tu cuenta." to="/student/notifications" tone="violet"/><AccountLink icon={Clock3} title="Ventanas de pedidos" description="Consulta cuándo puedes pedir y cuántos cupos quedan." to="/student/order-windows" tone="blue"/>{typeof window !== 'undefined' && window.location.pathname && <AccountLink icon={Star} title="Puntos y premios" description="Consulta tus recompensas cuando el programa esté habilitado." to="/student/rewards" tone="amber"/>}</div></div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-slate-700"/><div><h2 className="font-black">Ayuda y cuenta</h2><p className="text-sm text-slate-600">Acciones importantes antes de salir de QuickBite.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="font-black">¿Necesitas ayuda?</p><p className="mt-1 text-xs leading-5 text-slate-500">Para un problema de pedidos, pagos, saldo o acceso, utiliza las secciones correspondientes del Centro de funciones para llegar al estado y detalle correctos.</p><Link to="/student/features" className="mt-3 inline-flex items-center gap-2 text-sm font-black text-blue-700">Abrir Centro de funciones<ChevronRight className="h-4 w-4"/></Link></div><div className="flex flex-col justify-between rounded-2xl border border-rose-100 bg-rose-50/70 p-4"><div><p className="font-black text-rose-900">Cerrar sesión</p><p className="mt-1 text-xs leading-5 text-rose-800">Cierra únicamente la sesión de esta pestaña/cuenta actual.</p></div><button type="button" onClick={() => void signOut()} disabled={signingOut} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:bg-slate-300"><LogOut className="h-4 w-4"/>{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</button></div></div>
      </section>
    </div>
  </div>;
}
