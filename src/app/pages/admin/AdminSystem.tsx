import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { requireSupabaseClient, type SystemHealthCheck } from '../../../lib/supabase';

interface Metric { label: string; value: number; description: string; }
interface SystemSnapshot {
  health: SystemHealthCheck[];
  audit_events: number;
  open_alerts: number;
  failed_jobs: number;
  active_automations: number;
}

export function AdminSystem() {
  const [health, setHealth] = useState<SystemHealthCheck[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = requireSupabaseClient();
      const { error: healthError } = await supabase.rpc('run_admin_health_check');
      if (healthError) throw healthError;

      const { data, error: snapshotError } = await supabase.rpc('get_system_operational_snapshot');
      if (snapshotError) throw snapshotError;

      const snapshot = data as SystemSnapshot | null;
      if (!snapshot) throw new Error('No se recibió información operativa del sistema.');

      setHealth(Array.isArray(snapshot.health) ? snapshot.health : []);
      setMetrics([
        { label: 'Eventos de auditoría', value: Number(snapshot.audit_events ?? 0), description: 'Acciones registradas para trazabilidad.' },
        { label: 'Alertas abiertas', value: Number(snapshot.open_alerts ?? 0), description: 'Incidencias que requieren revisión.' },
        { label: 'Jobs fallidos', value: Number(snapshot.failed_jobs ?? 0), description: 'Automatizaciones que terminaron con error.' },
        { label: 'Automatizaciones activas', value: Number(snapshot.active_automations ?? 0), description: 'Procesos programados y supervisados.' },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el estado del sistema.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Sistema</p><h1 className="text-3xl font-black text-slate-900">Salud, auditoría y automatizaciones</h1><p className="mt-1 text-sm text-slate-600">Centro de control para comprobar que QuickBite funciona, conserva los datos y registra las operaciones.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-[#1747B8] px-4 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</button>
    </div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.label}</p><p className="mt-2 text-3xl font-black text-slate-900">{loading ? '—' : metric.value}</p><p className="mt-1 text-xs text-slate-500">{metric.description}</p></div>)}</div>

    <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="mb-4 flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-600" /><div><h2 className="font-black text-slate-900">Health checks</h2><p className="text-sm text-slate-600">Comprueba la disponibilidad de servicios críticos y mide su tiempo de respuesta.</p></div></div><div className="grid gap-3 md:grid-cols-2">{health.map((item, index) => <div key={`${item.service}-${item.checked_at}-${index}`} className="rounded-2xl border border-white/60 bg-white/60 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${item.status === 'healthy' ? 'bg-emerald-100 text-emerald-700' : item.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}><Activity className="h-4 w-4" /></div><div><p className="font-bold text-slate-900">{item.service}</p><p className="text-xs text-slate-500">{new Date(item.checked_at).toLocaleString('es-CO')}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${item.status === 'healthy' ? 'bg-emerald-100 text-emerald-700' : item.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span></div>{item.latency_ms != null && <p className="mt-3 text-xs font-medium text-slate-600">Tiempo de respuesta: {item.latency_ms} ms</p>}</div>)}{!loading && health.length === 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 md:col-span-2">No hay comprobaciones registradas todavía. Pulsa <strong>Actualizar</strong> para ejecutar una comprobación operativa.</div>}</div></section>

    <section><div className="mb-3"><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Funciones del sistema</p><h2 className="text-xl font-black text-slate-900">¿Qué hace cada módulo?</h2><p className="mt-1 text-sm text-slate-600">Estas funciones trabajan juntas para mantener los datos, detectar problemas y dejar evidencia de lo que ocurre.</p></div><div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Database className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Persistencia</h3><p className="mt-1 text-sm font-medium text-slate-700">Guarda y mantiene la información operativa de QuickBite en Supabase.</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600"><li>• Almacena pedidos, usuarios, menú e inventario.</li><li>• Conserva estados y movimientos de las operaciones.</li><li>• Permite recuperar los datos después de cerrar o reiniciar la aplicación.</li><li>• Centraliza la información para que Admin y Estudiante trabajen sobre los mismos datos.</li></ul></div>
      <div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Bot className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Automatización</h3><p className="mt-1 text-sm font-medium text-slate-700">Ejecuta y supervisa tareas automáticas para reducir trabajo manual y detectar fallos.</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600"><li>• Ejecuta comprobaciones de salud del sistema.</li><li>• Supervisa jobs y registra ejecuciones fallidas.</li><li>• Permite procesos programados de mantenimiento y respaldo.</li><li>• Trabaja junto al Auto-Heal para detectar incidencias y actuar cuando corresponde.</li></ul></div>
      <div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><ShieldCheck className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Auditoría</h3><p className="mt-1 text-sm font-medium text-slate-700">Registra qué operaciones ocurren en el sistema para facilitar control y revisión.</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600"><li>• Registra acciones y eventos relevantes.</li><li>• Permite consultar actividad para detectar anomalías.</li><li>• Mantiene trazabilidad de operaciones administrativas.</li><li>• Ayuda a investigar errores y verificar el comportamiento del sistema.</li></ul></div>
    </div></section>

    <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5"><h2 className="font-black text-slate-900">Cómo interpretar este panel</h2><div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3"><div><strong className="text-emerald-700">HEALTHY</strong><p>El servicio respondió correctamente y está disponible.</p></div><div><strong className="text-amber-700">DEGRADED</strong><p>El servicio responde, pero presenta una condición que debe vigilarse.</p></div><div><strong className="text-red-700">UNHEALTHY</strong><p>Existe un fallo que requiere atención o recuperación.</p></div></div></section>
  </div>;
}
