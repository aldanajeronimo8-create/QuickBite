import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Bell, Boxes, RefreshCw, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { getDailySales, getDailySummary, getDemandSummary, getStaffRole, listLowStockProducts, listNotifications, listOpenAlerts, resolveAlert, subscribeToOrderQueue } from '../../../services/platformFeatures';

export function AdminPlatformHub() {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lowStock, setLowStock] = useState<Array<{ id: string; name: string; stock: number; available: boolean }>>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; title?: string; message?: string }>>([]);
  const [notifications, setNotifications] = useState<Array<{ id: string; title?: string; message?: string }>>([]);
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([]);
  const [demand, setDemand] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [role, setRole] = useState<string>('');
  const [realtime, setRealtime] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [stockRows, alertRows, notificationRows, salesRows, demandRows, summaryRow, staffRole] = await Promise.all([
        listLowStockProducts(), listOpenAlerts(), listNotifications(user.id), getDailySales(14), getDemandSummary(14), getDailySummary(), getStaffRole(user.id),
      ]);
      setLowStock(stockRows.map(({ id, name, stock, available }) => ({ id, name, stock, available })));
      setAlerts(alertRows ?? []);
      setNotifications((notificationRows ?? []).slice(0, 6));
      setSales((salesRows ?? []) as Array<Record<string, unknown>>);
      setDemand((demandRows ?? []) as Array<Record<string, unknown>>);
      setSummary((summaryRow ?? null) as Record<string, unknown> | null);
      setRole(staffRole ?? 'administrator');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los controles de plataforma.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const channel = subscribeToOrderQueue(() => setRealtime(true));
    return () => { void channel.unsubscribe(); };
  }, [open, refresh]);

  if (!user) return null;
  const todaySales = summary ? Number(summary.total_sales ?? summary.sales ?? 0) : 0;
  const todayOrders = summary ? Number(summary.total_orders ?? summary.orders ?? 0) : 0;
  const demandTotal = demand.reduce((total, row) => total + Number(row.quantity ?? row.total_quantity ?? 0), 0);

  async function dismissAlert(id: string) {
    try { await resolveAlert(id); setAlerts((current) => current.filter((item) => item.id !== id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo cerrar la alerta.'); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-xl ring-4 ring-white/80 hover:bg-blue-800" aria-label="Abrir centro de plataforma"><Activity className="h-4 w-4" /> Plataforma {alerts.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-blue-800">{alerts.length}</span>}</button>
    {open && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4" onMouseDown={() => setOpen(false)}><section className="mx-auto mt-8 max-h-[88vh] max-w-5xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Centro de plataforma</p><h2 className="text-2xl font-black text-slate-950">Operación automática de QuickBite</h2><p className="text-sm text-slate-500">Rol: {role || 'cargando'} · {realtime ? 'Realtime activo' : 'Esperando eventos'}</p></div><div className="flex gap-2"><button onClick={() => void refresh()} disabled={loading} className="rounded-xl border p-2" aria-label="Actualizar"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => setOpen(false)} className="rounded-xl border p-2" aria-label="Cerrar"><X className="h-4 w-4" /></button></div></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric icon={BarChart3} label="Ventas 14 días" value={sales.length ? `${sales.length} días` : 'Sin datos'} />
        <Metric icon={Boxes} label="Stock crítico" value={String(lowStock.length)} />
        <Metric icon={Bell} label="Alertas abiertas" value={String(alerts.length)} />
        <Metric icon={ShieldCheck} label="Pedidos hoy" value={String(todayOrders || 0)} />
        <Metric icon={TrendingUp} label="Demanda 14 días" value={String(demandTotal)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><AlertTriangle className="h-5 w-5" /> Alertas y stock</h3>{alerts.length ? <div className="space-y-2">{alerts.slice(0, 5).map((alert) => <div key={alert.id} className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 p-3"><div><p className="font-bold">{alert.title ?? 'Alerta'}</p><p className="text-sm text-slate-600">{alert.message}</p></div><button className="text-xs font-bold text-blue-700" onClick={() => void dismissAlert(alert.id)}>Resolver</button></div>)}</div> : <p className="text-sm text-slate-500">No hay alertas abiertas.</p>}{lowStock.length > 0 && <div className="mt-3 space-y-2">{lowStock.slice(0, 5).map((product) => <div key={product.id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{product.name}</span><span className="font-black text-amber-700">Stock {product.stock}</span></div>)}</div>}</section>
        <section className="rounded-2xl border p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><TrendingUp className="h-5 w-5" /> Resumen operativo</h3><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ventas hoy</p><p className="text-xl font-black">${todaySales.toLocaleString('es-CO')}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Notificaciones</p><p className="text-xl font-black">{notifications.length}</p></div></div><p className="mt-3 text-xs text-slate-500">Demanda registrada: {demand.length} registros · {demandTotal} unidades en los últimos 14 días.</p><p className="mt-1 text-xs text-slate-500">Las métricas y alertas se consultan desde Supabase; Realtime actualiza el estado cuando llegan cambios de pedidos.</p></section>
      </div>
    </section></div>}
  </>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="mb-2 h-5 w-5 text-blue-700" /><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>;
}
