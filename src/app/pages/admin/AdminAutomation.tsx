import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Bot, CheckCircle2, Package, Play, RefreshCw, Settings2, TrendingUp } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { requireSupabaseClient } from '../../../lib/supabase';
import { getDailySales, getDailySummary, listLowStockProducts, listOpenAlerts, resolveAlert, suggestPreparationQuantity, recordAutomationJob } from '../../../services/platformFeatures';

type AutomationSetting = { key: string; label: string; description: string; enabled: boolean; updated_at: string };

export function AdminAutomation() {
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<AutomationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const [salesData, summaryData, stockData, alertData, settingsData] = await Promise.all([
        getDailySales(14), getDailySummary(), listLowStockProducts(), listOpenAlerts(), client.rpc('admin_get_automation_settings'),
      ]);
      if (settingsData.error) throw settingsData.error;
      setSales(salesData ?? []); setSummary(summaryData); setLowStock(stockData ?? []); setAlerts(alertData ?? []); setSettings((settingsData.data ?? []) as AutomationSetting[]);
      const next: Record<string, number> = {};
      for (const product of stockData ?? []) next[product.id] = await suggestPreparationQuantity(product.id);
      setSuggestions(next);
      await recordAutomationJob('admin-automation-refresh', 'success');
    } catch (error) {
      await recordAutomationJob('admin-automation-refresh', 'failed', 1, error instanceof Error ? error.message : 'Error desconocido');
    } finally { setLoading(false); }
  }

  async function toggleSetting(setting: AutomationSetting) {
    setSavingKey(setting.key);
    try {
      const { error } = await requireSupabaseClient().rpc('admin_set_automation_setting', { p_key: setting.key, p_enabled: !setting.enabled });
      if (error) throw error;
      setSettings((current) => current.map((item) => item.key === setting.key ? { ...item, enabled: !item.enabled, updated_at: new Date().toISOString() } : item));
    } catch (error) {
      await recordAutomationJob(`automation-toggle:${setting.key}`, 'failed', 1, error instanceof Error ? error.message : 'No se pudo cambiar la configuración.');
    } finally { setSavingKey(null); }
  }

  async function runNow() {
    setRunning(true);
    try {
      const { error } = await requireSupabaseClient().rpc('run_quickbite_automations');
      if (error) throw error;
      await refresh();
    } catch (error) {
      await recordAutomationJob('quickbite-cycle-manual', 'failed', 1, error instanceof Error ? error.message : 'No se pudo ejecutar la automatización.');
    } finally { setRunning(false); }
  }

  useEffect(() => { void refresh(); }, []);

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-3"><Bot className="h-8 w-8 text-blue-700" /><h1 className="text-4xl font-black text-blue-950">Automatización</h1></div><p className="mt-2 text-slate-600">Configura y ejecuta las tareas automáticas de QuickBite desde un solo lugar.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button><Button onClick={() => void runNow()} disabled={running} className="bg-blue-700 text-white"><Play className="mr-2 h-4 w-4" />{running ? 'Ejecutando…' : 'Ejecutar ahora'}</Button></div></div>
    <div className="grid gap-4 md:grid-cols-4"><Card className="p-5"><TrendingUp className="mb-2 h-6 w-6 text-blue-700" /><p className="text-sm text-slate-500">Ventas recientes</p><strong className="text-2xl">${sales.reduce((s, x) => s + Number(x.sales_total ?? 0), 0).toLocaleString('es-CO')}</strong></Card><Card className="p-5"><Package className="mb-2 h-6 w-6 text-amber-600" /><p className="text-sm text-slate-500">Stock crítico</p><strong className="text-2xl">{lowStock.length}</strong></Card><Card className="p-5"><BellRing className="mb-2 h-6 w-6 text-red-600" /><p className="text-sm text-slate-500">Alertas abiertas</p><strong className="text-2xl">{alerts.length}</strong></Card><Card className="p-5"><Bot className="mb-2 h-6 w-6 text-green-700" /><p className="text-sm text-slate-500">Estado</p><strong className="text-lg">{loading ? 'Procesando…' : 'Operativo'}</strong></Card></div>
    <Card className="p-6"><div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-bold">Funciones automáticas</h2></div><div className="grid gap-3 md:grid-cols-3">{settings.map((setting) => <div key={setting.key} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{setting.label}</p><p className="mt-1 text-sm text-slate-600">{setting.description}</p></div><Badge className={setting.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}>{setting.enabled ? 'Activa' : 'Desactivada'}</Badge></div><Button size="sm" variant="outline" className="mt-4 w-full" disabled={savingKey === setting.key} onClick={() => void toggleSetting(setting)}>{setting.enabled ? 'Desactivar' : 'Activar'}</Button></div>)}</div></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card className="p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Alertas</h2><Badge>{alerts.length}</Badge></div>{alerts.length === 0 ? <p className="text-slate-500">No hay alertas abiertas.</p> : <div className="space-y-3">{alerts.map((a) => <div key={a.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{a.title}</p><p className="text-sm text-slate-600">{a.message}</p></div><AlertTriangle className="h-5 w-5 text-amber-600" /></div><Button size="sm" variant="outline" className="mt-3" onClick={() => void resolveAlert(a.id).then(refresh)}>Resolver</Button></div>)}</div>}</Card><Card className="p-6"><h2 className="mb-4 text-xl font-bold">Inventario + preparación sugerida</h2>{lowStock.length === 0 ? <p className="text-slate-500">No hay productos bajo el umbral.</p> : <div className="space-y-3">{lowStock.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><div><p className="font-semibold">{p.name}</p><p className="text-sm text-slate-600">Stock: {p.stock}</p></div><div className="text-right"><p className="text-sm text-slate-500">Preparar</p><strong>{suggestions[p.id] ?? '—'}</strong></div></div>)}</div>}</Card></div>
    <Card className="p-6"><h2 className="mb-4 text-xl font-bold">Cierre diario</h2>{summary ? <div className="grid gap-4 md:grid-cols-5"><div><p className="text-xs text-slate-500">Pedidos</p><strong>{summary.orders_count}</strong></div><div><p className="text-xs text-slate-500">Entregados</p><strong>{summary.delivered_orders_count}</strong></div><div><p className="text-xs text-slate-500">Ventas</p><strong>${Number(summary.sales_total).toLocaleString('es-CO')}</strong></div><div><p className="text-xs text-slate-500">Productos</p><strong>{summary.items_sold}</strong></div><div><p className="text-xs text-slate-500">Ticket promedio</p><strong>${Number(summary.average_ticket).toLocaleString('es-CO')}</strong></div></div> : <div className="flex items-center gap-2 text-slate-500"><CheckCircle2 className="h-5 w-5" />Aún no se ha generado el resumen del día.</div>}</Card>
  </div>;
}
