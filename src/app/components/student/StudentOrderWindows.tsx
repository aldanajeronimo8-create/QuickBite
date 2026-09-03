import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Info, RefreshCw, TimerReset, Power } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requireSupabaseClient } from '@/lib/supabaseClient';

type OrderWindow = {
  slot_id: string;
  slot_name: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  max_orders: number | null;
  orders_count: number;
  accepting_orders: boolean;
};

const FRIENDLY_WINDOW_ERROR = 'No se pudo actualizar el estado de las ventanas. Intenta de nuevo.';

function timeLabel(value: string) { return value.slice(0, 5); }
function timeToMinutes(value: string) { const [hours, minutes] = value.slice(0, 5).split(':').map(Number); return (hours * 60) + minutes; }
function currentBogotaMinutes() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return (hour * 60) + minute;
}
function minutesUntil(start: string, now: number) { const difference = timeToMinutes(start) - now; return difference >= 0 ? difference : (24 * 60) + difference; }
function availabilityLabel(orderWindow: OrderWindow) {
  if (!orderWindow.enabled) return 'No disponible';
  if (orderWindow.accepting_orders) return 'Puedes pedir ahora';
  if (orderWindow.max_orders !== null && orderWindow.orders_count >= orderWindow.max_orders) return 'Cupo lleno';
  return 'Fuera de horario';
}

export default function StudentOrderWindows() {
  const [windows, setWindows] = useState<OrderWindow[]>([]);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => currentBogotaMinutes());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const client = requireSupabaseClient();
      const [windowsResult, featureResult] = await Promise.all([
        client.rpc('get_order_window_status'),
        client.rpc('get_order_windows_enabled'),
      ]);
      if (windowsResult.error) throw windowsResult.error;
      if (featureResult.error) throw featureResult.error;
      setWindows((windowsResult.data ?? []) as OrderWindow[]);
      setFeatureEnabled(featureResult.data === true);
      setError(null);
      setNowMinutes(currentBogotaMinutes());
    } catch {
      setError(FRIENDLY_WINDOW_ERROR);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => { setNowMinutes(currentBogotaMinutes()); void load(); }, 15_000);
    const clockTimer = window.setInterval(() => setNowMinutes(currentBogotaMinutes()), 1_000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [load]);

  const orderedWindows = useMemo(() => [...windows].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [windows]);
  const activeWindow = featureEnabled ? orderedWindows.find((orderWindow) => orderWindow.accepting_orders) : undefined;
  const nextWindow = featureEnabled
    ? orderedWindows.filter((orderWindow) => orderWindow.enabled && !orderWindow.accepting_orders && minutesUntil(orderWindow.starts_at, nowMinutes) > 0).sort((a, b) => minutesUntil(a.starts_at, nowMinutes) - minutesUntil(b.starts_at, nowMinutes))[0]
      ?? orderedWindows.find((orderWindow) => orderWindow.enabled && !orderWindow.accepting_orders)
    : undefined;
  const nextWindowIn = nextWindow ? minutesUntil(nextWindow.starts_at, nowMinutes) : null;
  const totalRemaining = orderedWindows.reduce((total, orderWindow) => orderWindow.max_orders === null ? total : total + Math.max(orderWindow.max_orders - orderWindow.orders_count, 0), 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,.15),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.14),_transparent_32%),#f6f9f8] p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-2xl backdrop-blur-2xl">
          <div className="bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em] text-emerald-700 shadow-sm ring-1 ring-emerald-100"><Clock3 className="h-4 w-4"/>Organización de pedidos</div>
                <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Ventanas de pedidos</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Revisa cuándo puedes pedir, cuántos cupos quedan y cuál será tu próxima oportunidad para comprar sin hacer fila.</p>
              </div>
              <div className="flex items-center gap-2 self-start">
                <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-full border border-white bg-white/90 px-4 py-2.5 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}/>Actualizar</button>
                <Link to="/student/features" className="inline-flex items-center gap-2 rounded-full border border-white bg-white/70 px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ArrowLeft className="h-4 w-4"/>Funciones</Link>
              </div>
            </div>
            {!featureEnabled ? (
              <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50/95 p-5 text-amber-950 shadow-sm"><Power className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-black">Función deshabilitada temporalmente</p><p className="mt-1 text-sm leading-5 text-amber-900">La cafetería desactivó la restricción por ventanas. Los pedidos continúan funcionando normalmente y estos horarios se conservarán para cuando la función vuelva a habilitarse.</p></div></div>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white bg-white/75 p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Estado ahora</p><p className="mt-1 text-lg font-black text-slate-900">{featureEnabled ? (activeWindow ? activeWindow.slot_name : 'Pedidos cerrados') : 'Función deshabilitada'}</p><p className="mt-1 text-xs text-slate-500">{featureEnabled ? (activeWindow ? 'La ventana está recibiendo pedidos.' : 'Consulta la próxima ventana disponible.') : 'El menú sigue disponible sin restricción de horario.'}</p></div>
              <div className="rounded-2xl border border-white bg-white/75 p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Próxima ventana</p><p className="mt-1 text-lg font-black text-slate-900">{featureEnabled ? (nextWindow ? nextWindow.slot_name : 'Sin horarios') : 'No aplica'}</p><p className="mt-1 text-xs text-slate-500">{featureEnabled ? (nextWindow ? `${timeLabel(nextWindow.starts_at)} – ${timeLabel(nextWindow.ends_at)}${nextWindowIn === 0 ? '' : ` · ${nextWindowIn} min`}` : 'No hay una próxima ventana habilitada.') : 'La compra no está limitada por estas ventanas.'}</p></div>
              <div className="rounded-2xl border border-white bg-white/75 p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Cupos restantes</p><p className="mt-1 text-lg font-black text-slate-900">{orderedWindows.some((item) => item.max_orders === null) ? 'Sin límite' : totalRemaining}</p><p className="mt-1 text-xs text-slate-500">Capacidad calculada con las ventanas configuradas.</p></div>
            </div>
          </div>
        </div>

        {error ? <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{error}</div> : null}
        {loading ? <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 text-sm font-semibold text-slate-500 shadow-xl">Cargando ventanas...</section> : orderedWindows.length === 0 ? <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 text-center shadow-xl"><Clock3 className="mx-auto h-10 w-10 text-slate-400"/><h2 className="mt-3 text-xl font-black">No hay ventanas configuradas</h2><p className="mt-1 text-sm text-slate-500">Cuando la cafetería publique horarios, aparecerán aquí.</p></section> : (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3 px-1"><div><h2 className="text-xl font-black">Horario de hoy</h2><p className="mt-1 text-sm text-slate-500">Los cupos se actualizan automáticamente cada 15 segundos.</p></div><span className="hidden rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-white sm:inline-flex">Hora Colombia</span></div>
            <div className="grid gap-4 lg:grid-cols-2">
              {orderedWindows.map((orderWindow) => {
                const remaining = orderWindow.max_orders === null ? null : Math.max(orderWindow.max_orders - orderWindow.orders_count, 0);
                const progress = orderWindow.max_orders ? Math.min((orderWindow.orders_count / orderWindow.max_orders) * 100, 100) : 0;
                const status = featureEnabled ? availabilityLabel(orderWindow) : 'Informativa';
                const isActive = featureEnabled && orderWindow.accepting_orders;
                const isFull = remaining === 0 && orderWindow.max_orders !== null;
                return <article key={orderWindow.slot_id} className={`overflow-hidden rounded-[1.75rem] border bg-white/80 p-5 shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl ${isActive ? 'border-emerald-200 ring-2 ring-emerald-100' : 'border-white/70'}`}>
                  <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{isActive ? <CheckCircle2 className="h-5 w-5"/> : <TimerReset className="h-5 w-5"/>}</div><div className="min-w-0"><h3 className="truncate text-lg font-black">{orderWindow.slot_name}</h3><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500"><Clock3 className="h-4 w-4"/>{timeLabel(orderWindow.starts_at)} – {timeLabel(orderWindow.ends_at)}</p></div></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${isActive ? 'bg-emerald-100 text-emerald-800' : isFull && featureEnabled ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{status}</span></div>
                  <div className="mt-5 rounded-2xl bg-slate-50/90 p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-700">Capacidad</span><span className="font-black text-slate-900">{orderWindow.max_orders === null ? `${orderWindow.orders_count} pedidos · sin límite` : `${orderWindow.orders_count} / ${orderWindow.max_orders}`}</span></div>{orderWindow.max_orders !== null ? <><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{width:`${progress}%`}}/></div><p className="mt-2 text-xs font-semibold text-slate-500">{remaining === 0 ? 'Ya no quedan cupos para esta ventana.' : `${remaining} cupos restantes.`}</p></> : <p className="mt-2 text-xs font-semibold text-slate-500">Esta ventana no tiene un límite de pedidos configurado.</p>}</div>
                  {isActive ? <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0"/>Puedes dirigirte al menú y realizar tu pedido ahora.</div> : null}
                </article>;
              })}
            </div>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Clock3 className="h-5 w-5"/></div><h2 className="mt-4 font-black">1. Revisa tu horario</h2><p className="mt-1 text-sm leading-5 text-slate-500">Mira cuál ventana está activa o cuál será la siguiente.</p></div>
          <div className="rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-100 text-blue-700"><Info className="h-5 w-5"/></div><h2 className="mt-4 font-black">2. Comprueba los cupos</h2><p className="mt-1 text-sm leading-5 text-slate-500">La capacidad visible te ayuda a saber si todavía hay espacio para pedir.</p></div>
          <div className="rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-700"><CheckCircle2 className="h-5 w-5"/></div><h2 className="mt-4 font-black">3. Pide con tiempo</h2><p className="mt-1 text-sm leading-5 text-slate-500">Cuando veas “Puedes pedir ahora”, entra al menú para completar tu compra.</p></div>
        </section>
        <div className="flex items-center justify-center gap-2 pb-3 text-xs font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true"/>Estado sincronizado automáticamente</div>
      </div>
    </main>
  );
}
