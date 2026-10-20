import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Info, RefreshCw, ShoppingBag, TimerReset, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { loadStudentOrderSchedule, type PickupOrderWindow, type RecessOrderOption } from './studentOrderSchedule';

type OrderRule = 'loading' | 'recess' | 'pickup' | 'unrestricted' | 'unknown';

const FRIENDLY_ERROR = 'No pudimos determinar qué horario rige tus pedidos. Actualiza la información antes de usar estos horarios como referencia.';
const timeLabel = (value: string) => value.slice(0, 5);
const timeToMinutes = (value: string) => {
  const parts = value.slice(0, 5).split(':').map(Number);
  return parts[0] * 60 + parts[1];
};

function currentBogotaMinutes() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function recessStatus(option: RecessOrderOption) {
  if (option.waitlist_status === 'waiting') {
    return option.waitlist_position ? 'Lista de espera · posición ' + option.waitlist_position : 'En lista de espera';
  }
  if (option.waitlist_status === 'offered') return 'Plaza reservada para ti';
  if (!option.window_open) return 'Horario cerrado';
  if (!option.can_order) return 'Cupo de estudiantes completo';
  if (option.is_active) return 'Puedes pedir ahora';
  return 'Puedes reservar para este descanso';
}

function pickupStatus(window: PickupOrderWindow, nowMinutes: number) {
  if (!window.enabled) return 'Ventana desactivada';
  const starts = timeToMinutes(window.starts_at);
  const ends = timeToMinutes(window.ends_at);
  const inWindow = nowMinutes >= starts && nowMinutes < ends;
  if (inWindow) return window.accepting_orders ? 'Puedes pedir ahora' : 'Cupo de pedidos completo';
  if (nowMinutes < starts) return 'Próxima ventana';
  return 'Cerrada por hoy';
}

export default function StudentOrderWindows() {
  const [recessOptions, setRecessOptions] = useState<RecessOrderOption[]>([]);
  const [pickupWindows, setPickupWindows] = useState<PickupOrderWindow[]>([]);
  const [rule, setRule] = useState<OrderRule>('loading');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => currentBogotaMinutes());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const schedule = await loadStudentOrderSchedule();
      if (schedule.mode === 'recess') {
        setRecessOptions(schedule.recessOptions);
        setPickupWindows([]);
        setRule('recess');
      } else if (schedule.mode === 'unrestricted') {
        setRecessOptions([]);
        setPickupWindows([]);
        setRule('unrestricted');
      } else {
        setRecessOptions([]);
        setPickupWindows(schedule.pickupWindows);
        setRule('pickup');
      }
      setNowMinutes(currentBogotaMinutes());
    } catch (loadError) {
      console.error('[QuickBite] No se pudo resolver el horario que rige los pedidos.', loadError);
      setRecessOptions([]);
      setPickupWindows([]);
      setRule('unknown');
      setError(FRIENDLY_ERROR);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => {
      setNowMinutes(currentBogotaMinutes());
      void load();
    }, 15000);
    const clockTimer = window.setInterval(() => setNowMinutes(currentBogotaMinutes()), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  const orderedRecesses = useMemo(
    () => [...recessOptions].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [recessOptions],
  );
  const orderedPickupWindows = useMemo(
    () => [...pickupWindows].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [pickupWindows],
  );
  const activeRecess = orderedRecesses.find((option) => option.is_active);
  const nextRecess = orderedRecesses.find(
    (option) => !option.is_active && option.window_open && timeToMinutes(option.start_time) > nowMinutes,
  );
  const currentPickupWindow = orderedPickupWindows.find((window) => {
    const starts = timeToMinutes(window.starts_at);
    const ends = timeToMinutes(window.ends_at);
    return window.enabled && nowMinutes >= starts && nowMinutes < ends;
  });
  const nextPickupWindow = orderedPickupWindows.find(
    (window) => window.enabled && timeToMinutes(window.starts_at) > nowMinutes,
  );

  const summaryTitle = rule === 'recess'
    ? activeRecess
      ? recessStatus(activeRecess)
      : nextRecess
        ? recessStatus(nextRecess)
        : 'Horarios de hoy cerrados'
    : rule === 'pickup'
      ? currentPickupWindow
        ? pickupStatus(currentPickupWindow, nowMinutes)
        : nextPickupWindow
          ? 'Próxima ventana: ' + nextPickupWindow.slot_name
          : 'No hay más ventanas hoy'
      : rule === 'unrestricted'
        ? 'Puedes pedir sin restricción de horario'
        : 'Horario pendiente de verificación';

  const summaryDetail = rule === 'recess'
    ? activeRecess
      ? activeRecess.name + ' · ' + timeLabel(activeRecess.start_time) + '–' + timeLabel(activeRecess.end_time)
      : nextRecess
        ? nextRecess.name + ' · ' + timeLabel(nextRecess.start_time) + '–' + timeLabel(nextRecess.end_time)
        : 'No quedan descansos habilitados para hoy.'
    : rule === 'pickup'
      ? currentPickupWindow
        ? currentPickupWindow.slot_name + ' · ' + timeLabel(currentPickupWindow.starts_at) + '–' + timeLabel(currentPickupWindow.ends_at)
        : nextPickupWindow
          ? timeLabel(nextPickupWindow.starts_at) + '–' + timeLabel(nextPickupWindow.ends_at)
          : 'Consulta con la cafetería si necesitas que habiliten un horario.'
      : rule === 'unrestricted'
        ? 'No hay un recreo activo asignado a tu sección hoy y las ventanas generales están desactivadas.'
        : 'No mostramos ventanas alternativas porque todavía no pudimos confirmar cuál regla se aplica.';

  const relevantPickupWindows = orderedPickupWindows.filter(
    (window) => window.enabled && timeToMinutes(window.ends_at) > nowMinutes,
  );
  const totalPickupRemaining = relevantPickupWindows.reduce((total, window) => {
    if (window.max_orders === null) return total;
    return total + Math.max(window.max_orders - Number(window.orders_count), 0);
  }, 0);

  return (
    <main className="min-h-screen bg-[#0D111D] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#121A2F] shadow-xl">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em] text-emerald-400">
                  <Clock3 className="h-4 w-4" />
                  Organización de pedidos
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Horario que rige tus pedidos</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                  Mostramos el horario que realmente valida la compra para tu perfil. La disponibilidad definitiva se vuelve a comprobar al confirmar el pedido.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start">
                <button
                  type="button"
                  onClick={() => void load(true)}
                  disabled={loading || refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  Actualizar
                </button>
                <Link to="/menu" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-500">
                  <ShoppingBag className="h-4 w-4" />
                  Ir al menú
                </Link>
                <Link to="/student/features" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 shadow-sm transition hover:bg-slate-700">
                  <ArrowLeft className="h-4 w-4" />
                  Funciones
                </Link>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-black">No se pudo verificar el horario</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2 text-xs text-amber-200/80">No asumimos que puedas pedir libremente: el servidor seguirá aplicando sus controles al crear el pedido.</p>
            </div>
          </div>
        )}

        {loading ? (
          <section className="rounded-3xl border border-slate-800 bg-[#121A2F] p-8 text-sm font-semibold text-slate-400 shadow-xl">
            Consultando el horario que rige tus pedidos…
          </section>
        ) : rule === 'recess' ? (
          <>
            <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-black text-emerald-200">Tus pedidos se rigen por los recreos de tu sección</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-100/80">
                    Estos horarios tienen prioridad sobre las ventanas generales de cafetería. Puedes reservar un pedido para un descanso futuro cuando haya capacidad; el menú vuelve a comprobar el horario y el cupo.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-slate-800 bg-[#121A2F] p-5">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Estado actual</p>
                <p className="mt-2 text-lg font-black text-white">{summaryTitle}</p>
                <p className="mt-1 text-sm text-slate-400">{summaryDetail}</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-[#121A2F] p-5">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
                  <Users className="h-4 w-4" />
                  Capacidad del horario actual
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {activeRecess
                    ? activeRecess.max_preorders === null
                      ? 'Sin límite de estudiantes'
                      : Math.max(Number(activeRecess.max_preorders) - Number(activeRecess.preorders_count), 0) + ' cupos de estudiante'
                    : nextRecess
                      ? nextRecess.max_preorders === null
                        ? 'Sin límite de estudiantes'
                        : Math.max(Number(nextRecess.max_preorders) - Number(nextRecess.preorders_count), 0) + ' cupos de estudiante'
                      : 'No hay un horario futuro disponible'}
                </p>
                <p className="mt-1 text-sm text-slate-400">El cupo cuenta estudiantes con pedido, no la cantidad de pedidos que hace cada estudiante.</p>
              </article>
            </section>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <h2 className="text-xl font-black text-white">Tus horarios de hoy</h2>
                  <p className="mt-1 text-sm text-slate-400">Hora Colombia · la disponibilidad se actualiza cada 15 segundos.</p>
                </div>
                <span className="hidden rounded-full bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-400 sm:inline-flex">Recreos por sección</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {orderedRecesses.map((option) => {
                  const count = Number(option.preorders_count);
                  const maximum = option.max_preorders === null ? null : Number(option.max_preorders);
                  const remaining = maximum === null ? null : Math.max(maximum - count, 0);
                  const progress = maximum && maximum > 0 ? Math.min((count / maximum) * 100, 100) : 0;
                  const status = recessStatus(option);
                  const active = option.is_active;
                  return (
                    <article key={option.recess_schedule_id} className={'overflow-hidden rounded-2xl border bg-[#121A2F] p-5 shadow-lg ' + (active ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-slate-800')}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={'mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl ' + (active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-400')}>
                            {active ? <CheckCircle2 className="h-5 w-5" /> : <TimerReset className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-black text-white">{option.name}</h3>
                            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400">
                              <Clock3 className="h-4 w-4" />
                              {timeLabel(option.start_time)} – {timeLabel(option.end_time)}
                            </p>
                          </div>
                        </div>
                        <span className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-black ' + (option.can_order && option.window_open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-300')}>
                          {status}
                        </span>
                      </div>
                      <div className="mt-5 rounded-xl border border-slate-800 bg-[#0D111D] p-4">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-bold text-slate-400">Estudiantes con pedido</span>
                          <span className="font-black text-white">{count}{maximum === null ? ' · sin límite' : ' / ' + maximum}</span>
                        </div>
                        {maximum !== null ? (
                          <>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: progress + '%' }} />
                            </div>
                            <p className="mt-2 text-xs font-semibold text-slate-400">
                              {remaining === 0 ? 'No quedan cupos nuevos para estudiantes en este descanso.' : remaining + ' cupos de estudiante restantes.'}
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-slate-400">Este descanso no tiene un límite de estudiantes configurado.</p>
                        )}
                      </div>
                      <p className="mt-4 flex items-start gap-2 text-sm leading-5 text-slate-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {option.waitlist_status === 'waiting'
                          ? 'Estás en lista de espera' + (option.waitlist_position ? ' en la posición ' + option.waitlist_position : '') + '. Consulta el menú para ver si se libera un cupo.'
                          : option.waitlist_status === 'offered'
                            ? 'Tienes un cupo reservado temporalmente. Completa tu pedido desde el menú antes de que venza la oferta.'
                            : !option.window_open
                              ? 'Este horario ya terminó y no acepta pedidos nuevos.'
                              : !option.can_order
                                ? 'La capacidad está completa. En el menú puedes consultar si está disponible la lista de espera.'
                                : option.is_active
                                  ? 'Este es el descanso activo para tu sección.'
                                  : 'Puedes dejar un pedido reservado para este descanso desde el menú.'}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : rule === 'pickup' ? (
          <>
            <section className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                <div>
                  <p className="font-black text-blue-200">Tus pedidos se rigen por las ventanas generales de cafetería</p>
                  <p className="mt-1 text-sm leading-6 text-blue-100/80">
                    No hay un recreo activo asignado a tu sección para hoy. La cafetería ha activado la restricción por ventanas y los pedidos deben registrarse dentro de uno de estos horarios con cupo disponible.
                  </p>
                </div>
              </div>
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-slate-800 bg-[#121A2F] p-5">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Estado actual</p>
                <p className="mt-2 text-lg font-black text-white">{summaryTitle}</p>
                <p className="mt-1 text-sm text-slate-400">{summaryDetail}</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-[#121A2F] p-5">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Cupos en ventanas abiertas o futuras</p>
                <p className="mt-2 text-lg font-black text-white">{relevantPickupWindows.length === 0 ? 'Sin ventanas abiertas o futuras' : relevantPickupWindows.some((window) => window.max_orders === null) ? 'Algunas ventanas no tienen límite' : totalPickupRemaining + ' cupos sumados'}</p>
                <p className="mt-1 text-sm text-slate-400">No contamos ventanas desactivadas ni horarios que ya terminaron.</p>
              </article>
            </section>
            {orderedPickupWindows.length === 0 ? (
              <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8">
                <h2 className="text-xl font-black text-amber-200">No hay ventanas generales configuradas</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/80">La restricción está activada, pero no hay horarios disponibles. La cafetería debe configurar una ventana en Administración antes de que puedas completar un pedido.</p>
              </section>
            ) : (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-white">Ventanas generales de hoy</h2>
                  <p className="mt-1 text-sm text-slate-400">Hora Colombia · se actualiza automáticamente cada 15 segundos.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {orderedPickupWindows.map((window) => {
                    const count = Number(window.orders_count);
                    const maximum = window.max_orders === null ? null : Number(window.max_orders);
                    const remaining = maximum === null ? null : Math.max(maximum - count, 0);
                    const progress = maximum && maximum > 0 ? Math.min((count / maximum) * 100, 100) : 0;
                    const status = pickupStatus(window, nowMinutes);
                    const active = status === 'Puedes pedir ahora';
                    return (
                      <article key={window.slot_id} className={'overflow-hidden rounded-2xl border bg-[#121A2F] p-5 shadow-lg ' + (active ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-slate-800')}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-black text-white">{window.slot_name}</h3>
                            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400">
                              <Clock3 className="h-4 w-4" />
                              {timeLabel(window.starts_at)} – {timeLabel(window.ends_at)}
                            </p>
                          </div>
                          <span className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-black ' + (active ? 'bg-emerald-500/15 text-emerald-300' : remaining === 0 && window.enabled ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-300')}>
                            {status}
                          </span>
                        </div>
                        <div className="mt-5 rounded-xl border border-slate-800 bg-[#0D111D] p-4">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-bold text-slate-400">Pedidos registrados</span>
                            <span className="font-black text-white">{count}{maximum === null ? ' · sin límite' : ' / ' + maximum}</span>
                          </div>
                          {maximum !== null ? (
                            <>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: progress + '%' }} />
                              </div>
                              <p className="mt-2 text-xs font-semibold text-slate-400">
                                {remaining === 0 ? 'Ya no quedan cupos para esta ventana.' : remaining + ' cupos de pedidos restantes.'}
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-xs font-semibold text-slate-400">Esta ventana no tiene límite de pedidos configurado.</p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : rule === 'unrestricted' ? (
          <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <h2 className="text-xl font-black text-emerald-200">No tienes una restricción de horario activa</h2>
                <p className="mt-2 text-sm leading-6 text-emerald-100/80">
                  No hay un recreo activo asignado a tu sección hoy y las ventanas generales están desactivadas. Puedes realizar un pedido desde el menú sin esperar una ventana. La disponibilidad del producto y las demás validaciones siguen aplicándose.
                </p>
                <Link to="/menu" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-500">
                  <ShoppingBag className="h-4 w-4" />
                  Abrir menú
                </Link>
              </div>
            </div>
          </section>
        ) : rule === 'unknown' ? (
          <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 text-amber-100">
            <AlertCircle className="h-8 w-8 text-amber-300" />
            <h2 className="mt-3 text-xl font-black">No mostramos horarios que no podamos confirmar</h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/80">Intenta actualizar esta pantalla. No asumimos que tu cuenta esté exenta de restricciones si el servicio no pudo consultar la regla aplicable.</p>
          </section>
        ) : null}

        <div className="flex items-center justify-center gap-2 pb-3 text-xs font-semibold text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Regla del servidor sincronizada · hora Colombia
        </div>
      </div>
    </main>
  );
}
