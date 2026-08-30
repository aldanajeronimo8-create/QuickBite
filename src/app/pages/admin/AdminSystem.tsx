import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { requireSupabaseClient, type SystemHealthCheck } from '../../../lib/supabase';

interface Metric { label: string; value: number; }

export function AdminSystem() {
  const [health, setHealth] = useState<SystemHealthCheck[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = requireSupabaseClient();
      const [{ data: healthRows, error: healthError }, ...counts] = await Promise.all([
        supabase.from('system_health_checks').select('service,status,latency_ms,checked_at,details').order('checked_at', { ascending: false }).limit(12),
        supabase.from('system_audit_logs').select('*', { count: 'exact', head: true }),
        supabase.from('system_alerts').select('*', { count: 'exact', head: true }).is('resolved_at', null),
        supabase.from('automation_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('automation_settings').select('*', { count: 'exact', head: true }).eq('enabled', true),
      ]);
      if (healthError) throw healthError;
      setHealth((healthRows ?? []) as SystemHealthCheck[]);
      setMetrics([
        { label: 'Eventos de auditoría', value: counts[0].count ?? 0 },
        { label: 'Alertas abiertas', value: counts[1].count ?? 0 },
        { label: 'Jobs fallidos', value: counts[2].count ?? 0 },
        { label: 'Automatizaciones activas', value: counts[3].count ?? 0 },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el estado del sistema.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Sistema</p><h1 className="text-3xl font-black text-slate-900">Salud, auditoría y automatizaciones</h1><p className="mt-1 text-sm text-slate-600">Datos reales de Supabase para operar QuickBite con visibilidad.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-[#1747B8] px-4 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</button>
    </div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.label}</p><p className="mt-2 text-3xl font-black text-slate-900">{metric.value}</p></div>)}</div>
    <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="mb-4 flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-600" /><div><h2 className="font-black text-slate-900">Health checks</h2><p className="text-sm text-slate-600">Últimas comprobaciones registradas por el sistema.</p></div></div><div className="grid gap-3 md:grid-cols-2">{health.map((item, index) => <div key={`${item.service}-${item.checked_at}-${index}`} className="rounded-2xl border border-white/60 bg-white/60 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${item.status === 'healthy' ? 'bg-emerald-100 text-emerald-700' : item.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}><Activity className="h-4 w-4" /></div><div><p className="font-bold text-slate-900">{item.service}</p><p className="text-xs text-slate-500">{new Date(item.checked_at).toLocaleString('es-CO')}</p></div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-700">{item.status}</span></div>{item.latency_ms != null && <p className="mt-3 text-xs font-medium text-slate-600">Latencia: {item.latency_ms} ms</p>}</div>)}{!loading && health.length === 0 && <p className="text-sm text-slate-500">Aún no hay health checks registrados.</p>}</div></section>
    <div className="grid gap-4 md:grid-cols-3"><div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Database className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Persistencia</h3><p className="mt-1 text-sm text-slate-600">Pedidos, usuarios, catálogo y operaciones se almacenan en Supabase.</p></div><div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Bot className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Automatización</h3><p className="mt-1 text-sm text-slate-600">Los jobs y configuraciones activas se pueden supervisar desde esta pantalla.</p></div><div className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><ShieldCheck className="h-5 w-5 text-blue-700" /><h3 className="mt-3 font-black text-slate-900">Auditoría</h3><p className="mt-1 text-sm text-slate-600">Las acciones del sistema se registran para trazabilidad y revisión.</p></div></div>
  </div>;
}
