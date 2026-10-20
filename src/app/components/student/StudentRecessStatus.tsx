import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, TimerReset, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { loadStudentOrderSchedule, type StudentOrderSchedule } from './studentOrderSchedule';

function timeLabel(value: string) {
  return value.slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

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

export function StudentRecessStatus() {
  const [schedule, setSchedule] = useState<StudentOrderSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(() => currentBogotaMinutes());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setSchedule(await loadStudentOrderSchedule());
      setError(false);
      setNowMinutes(currentBogotaMinutes());
    } catch (loadError) {
      console.error('[QuickBite] No se pudo consultar el horario aplicable al pedido.', loadError);
      setSchedule(null);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(), 15000);
    const clockTimer = window.setInterval(() => setNowMinutes(currentBogotaMinutes()), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  const recessOptions = schedule?.mode === 'recess' ? schedule.recessOptions : [];
  const pickupWindows = schedule?.mode === 'pickup' ? schedule.pickupWindows : [];
  const activeRecess = recessOptions.find((option) => option.is_active);
  const nextRecess = recessOptions.find(
    (option) => !option.is_active && option.window_open && timeToMinutes(option.start_time) > nowMinutes,
  );
  const currentPickupWindow = pickupWindows.find((window) => {
    const starts = timeToMinutes(window.starts_at);
    const ends = timeToMinutes(window.ends_at);
    return window.enabled && nowMinutes >= starts && nowMinutes < ends;
  });
  const nextPickupWindow = pickupWindows.find(
    (window) => window.enabled && timeToMinutes(window.starts_at) > nowMinutes,
  );

  const modeLabel = useMemo(() => {
    if (!schedule) return 'Horario sin verificar';
    if (schedule.mode === 'unrestricted') return 'Sin restricción de horario';
    if (schedule.mode === 'recess') {
      if (activeRecess) return activeRecess.can_order ? 'Recreo de tu sección activo' : 'Recreo activo · cupo completo';
      if (nextRecess) return nextRecess.can_order ? 'Puedes reservar para el próximo recreo' : 'Próximo recreo · cupo completo';
      return 'Los recreos de hoy ya terminaron';
    }
    if (currentPickupWindow) return currentPickupWindow.accepting_orders ? 'Ventana general activa' : 'Ventana activa · cupo completo';
    if (nextPickupWindow) return 'Próxima ventana general';
    if (pickupWindows.length === 0) return 'Sin ventanas generales configuradas';
    return 'No hay más ventanas generales hoy';
  }, [activeRecess, currentPickupWindow, nextPickupWindow, pickupWindows.length, schedule, nextRecess]);

  const detail = !schedule
    ? 'No mostramos un horario que no hayamos podido confirmar. Actualiza antes de usar esta información como referencia.'
    : schedule.mode === 'unrestricted'
      ? 'No hay un recreo activo asignado a tu sección hoy y las ventanas generales están desactivadas. Puedes pedir desde el menú sin esperar una ventana.'
      : schedule.mode === 'recess'
        ? activeRecess
          ? activeRecess.name + ' · ' + timeLabel(activeRecess.start_time) + '–' + timeLabel(activeRecess.end_time) + '. Este horario tiene prioridad sobre las ventanas generales.'
          : nextRecess
            ? nextRecess.name + ' · ' + timeLabel(nextRecess.start_time) + '–' + timeLabel(nextRecess.end_time) + '. Puedes reservar desde el menú si hay capacidad.'
            : 'Los recreos de tu sección son los que rigen tus pedidos. No hay otro horario habilitado para hoy.'
        : currentPickupWindow
          ? currentPickupWindow.slot_name + ' · ' + timeLabel(currentPickupWindow.starts_at) + '–' + timeLabel(currentPickupWindow.ends_at) + '. La disponibilidad se valida al confirmar.'
          : nextPickupWindow
            ? nextPickupWindow.slot_name + ' · ' + timeLabel(nextPickupWindow.starts_at) + '–' + timeLabel(nextPickupWindow.ends_at) + '.'
            : pickupWindows.length === 0
              ? 'La restricción general está activada, pero Administración aún no ha configurado ventanas. No podrás completar un pedido hasta que exista un horario.'
              : 'No quedan ventanas generales habilitadas para hoy.';

  if (loading) {
    return <div className="rounded-2xl border border-slate-800 bg-[#121A2F] p-4 text-sm text-slate-400">Consultando el horario que rige tus pedidos…</div>;
  }

  return (
    <section
      aria-label="Horario que rige tus pedidos"
      className={'overflow-hidden rounded-3xl border p-5 shadow-lg ' + (schedule?.mode === 'unrestricted' ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#121A2F]')}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {error ? <AlertCircle className="h-5 w-5" /> : schedule?.mode === 'unrestricted' ? <CheckCircle2 className="h-5 w-5" /> : schedule?.mode === 'recess' && activeRecess ? <Zap className="h-5 w-5" /> : <TimerReset className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Horario de pedidos</p>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{error ? 'No se pudo verificar el horario' : modeLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">{detail}</p>
            {schedule?.mode === 'recess' && activeRecess && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Users className="h-3.5 w-3.5" />
                {activeRecess.max_preorders === null
                  ? 'Sin límite de estudiantes'
                  : Math.max(Number(activeRecess.max_preorders) - Number(activeRecess.preorders_count), 0) + ' cupos de estudiante restantes'}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to="/student/order-windows" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <Clock3 className="h-3.5 w-3.5" />
            Ver horarios
          </Link>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-black text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Actualizar
          </button>
        </div>
      </div>
      {schedule?.mode === 'pickup' && pickupWindows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {pickupWindows.filter((window) => window.enabled && timeToMinutes(window.ends_at) > nowMinutes).slice(0, 3).map((window) => (
            <span key={window.slot_id} className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {window.slot_name}: {timeLabel(window.starts_at)}–{timeLabel(window.ends_at)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span className={'h-2 w-2 rounded-full ' + (error ? 'bg-amber-500' : schedule?.mode === 'unrestricted' ? 'bg-emerald-500' : 'bg-blue-500')} aria-hidden="true" />
        La regla se sincroniza automáticamente · hora Colombia
      </div>
    </section>
  );
}
