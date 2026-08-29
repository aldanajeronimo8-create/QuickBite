import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Bot, CheckCircle2, Package, RefreshCw, TrendingUp } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getDailySales, getDailySummary, listLowStockProducts, listOpenAlerts, resolveAlert, suggestPreparationQuantity, recordAutomationJob } from '../../../services/platformFeatures';

export function AdminAutomation() {
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [salesData, summaryData, stockData, alertData] = await Promise.all([
        getDailySales(14), getDailySummary(), listLowStockProducts(), listOpenAlerts(),
      ]);
      setSales(salesData ?? []); setSummary(summaryData); setLowStock(stockData ?? []); setAlerts(alertData ?? []);
      const next: Record<string, number> = {};
      for (const product of stockData ?? []) next[product.id] = await suggestPreparationQuantity(product.id);
      setSuggestions(next);
      await recordAutomationJob('admin-automation-refresh', 'success');
    } catch (error) {
      await recordAutomationJob('admin-automation-refresh', 'failed', 1, error instanceof Error ? error.message : 'Error desconocido');
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><h1 className="text-3xl font-bold text-blue-950">Centro de automatización</h1><p className="text-slate-600">Operación automática, alertas, inventario y demanda.</p></div>
      <Button onClick={() => void refresh()} disabled={loading} className="bg-blue-700 text-white"><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </div>

    <div className="grid gap-4 md:grid-cols-4">
      <Card className="p-5"><TrendingUp className="mb-2 h-6 w-6 text-blue-700" /><p className="text-sm text-slate-500">Ventas recientes</p><strong className="text-2xl">${sales.reduce((s, x) => s + Number(x.sales_total ?? 0), 0).toLocaleString('es-CO')}</strong></Card>
      <Card className="p-5"><Package className="mb-2 h-6 w-6 text-amber-600" /><p className="text-sm text-slate-500">Stock crítico</p><strong className="text-2xl">{lowStock.length}</strong></Card>
      <Card className="p-5"><BellRing className="mb-2 h-6 w-6 text-red-600" /><p className="text-sm text-slate-500">Alertas abiertas</p><strong className="text-2xl">{alerts.length}</strong></Card>
      <Card className="p-5"><Bot className="mb-2 h-6 w-6 text-green-700" /><p className="text-sm text-slate-500">Estado</p><strong className="text-lg">{loading ? 'Procesando…' : 'Operativo'}</strong></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Alertas</h2><Badge>{alerts.length}</Badge></div>{alerts.length === 0 ? <p className="text-slate-500">No hay alertas abiertas.</p> : <div className="space-y-3">{alerts.map((a) => <div key={a.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{a.title}</p><p className="text-sm text-slate-600">{a.message}</p></div><AlertTriangle className="h-5 w-5 text-amber-600" /></div><Button size="sm" variant="outline" className="mt-3" onClick={() => void resolveAlert(a.id).then(refresh)}>Resolver</Button></div>)}</div>}</Card>
      <Card className="p-6"><h2 className="mb-4 text-xl font-bold">Inventario + preparación sugerida</h2>{lowStock.length === 0 ? <p className="text-slate-500">No hay productos bajo el umbral.</p> : <div className="space-y-3">{lowStock.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><div><p className="font-semibold">{p.name}</p><p className="text-sm text-slate-600">Stock: {p.stock}</p></div><div className="text-right"><p className="text-sm text-slate-500">Preparar</p><strong>{suggestions[p.id] ?? '—'}</strong></div></div>)}</div>}</Card>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-xl font-bold">Cierre diario</h2>{summary ? <div className="grid gap-4 md:grid-cols-5"><div><p className="text-xs text-slate-500">Pedidos</p><strong>{summary.orders_count}</strong></div><div><p className="text-xs text-slate-500">Entregados</p><strong>{summary.delivered_orders_count}</strong></div><div><p className="text-xs text-slate-500">Ventas</p><strong>${Number(summary.sales_total).toLocaleString('es-CO')}</strong></div><div><p className="text-xs text-slate-500">Productos</p><strong>{summary.items_sold}</strong></div><div><p className="text-xs text-slate-500">Ticket promedio</p><strong>${Number(summary.average_ticket).toLocaleString('es-CO')}</strong></div></div> : <div className="flex items-center gap-2 text-slate-500"><CheckCircle2 className="h-5 w-5" />Aún no se ha generado el resumen del día.</div>}</Card>
  </div>;
}
