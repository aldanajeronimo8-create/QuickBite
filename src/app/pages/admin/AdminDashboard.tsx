import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  CreditCard,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import { type SystemHealthCheck } from '../../../lib/supabase';
import { getSystemHealthSummary } from '../../../repositories/quickbiteRepository';
import { getAdminDashboardIntelligence, type DashboardAnalytics } from '../../../repositories/dashboardRepository';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

const surfaceCard = 'border qb-border qb-surface p-5 shadow-sm';

function currency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    entry: 'Entradas',
    sale: 'Ventas',
    reservation: 'Reservas',
    release: 'Liberaciones',
    return: 'Devoluciones',
    adjustment: 'Ajustes',
  };
  return labels[type] ?? type;
}

function riskLabel(level?: string) {
  if (level === 'critical') return 'Crítico';
  if (level === 'high') return 'Alto';
  return 'Medio';
}

export function AdminDashboard() {
  const { orders, products } = useDataStore();
  const [health, setHealth] = useState<SystemHealthCheck[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const loadDashboard = async () => {
    setLoadingAnalytics(true);
    try {
      const [currentHealth, currentAnalytics] = await Promise.all([
        getSystemHealthSummary().catch(() => [] as SystemHealthCheck[]),
        getAdminDashboardIntelligence(30),
      ]);
      setHealth(currentHealth);
      setAnalytics(currentAnalytics);
    } catch {
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    const interval = window.setInterval(() => void loadDashboard(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const operationalOrders = orders.filter((order) => !order.admin_hidden);
    const todayOrders = operationalOrders.filter((order) => new Date(order.created_at) >= today);
    const outOfStock = products.filter((p) => p.stock === 0 && p.available).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5 && p.available).length;
    const pendingOrders = operationalOrders.filter((o) => o.status === 'pending').length;
    return { todayOrders: todayOrders.length, outOfStock, lowStock, pendingOrders };
  }, [orders, products]);

  const databaseHealth = health.find((check) => check.service === 'supabase_database');
  const healthStyle = databaseHealth?.status === 'healthy'
    ? { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', label: 'Operativo' }
    : databaseHealth?.status === 'degraded'
      ? { badge: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500', label: 'Degradado' }
      : databaseHealth?.status === 'unhealthy'
        ? { badge: 'bg-red-100 text-red-800', dot: 'bg-red-500', label: 'Con problema' }
        : { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', label: 'Sin comprobación' };

  const topProducts = analytics?.top_products ?? [];
  const stockRisk = analytics?.stock_risk ?? [];
  const maxSales = Math.max(...topProducts.map((product) => product.units_sold), 1);
  const maxDailyRevenue = Math.max(...(analytics?.daily ?? []).map((day) => day.revenue), 1);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-xl bg-[var(--qb-primary)]/10 p-2 text-[var(--qb-primary)]"><Sparkles className="h-5 w-5" /></div>
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--qb-text-muted)]">Control inteligente</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--qb-text)]">Dashboard</h1>
          <p className="mt-2 text-lg text-[var(--qb-text-secondary)]">Ventas, inventario y señales de demanda de QuickBite.</p>
        </div>
        <Button variant="outline" onClick={() => void loadDashboard()} disabled={loadingAnalytics}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
          Actualizar datos
        </Button>
      </div>

      <Card className={surfaceCard}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--qb-surface-elevated)] p-2.5 text-[var(--qb-text-secondary)]"><Activity className="h-5 w-5" /></div>
            <div>
              <h2 className="qb-text font-bold">Estado del sistema</h2>
              <p className="qb-text-secondary mt-1 text-sm">Monitor de base de datos y latencia.</p>
            </div>
          </div>
          <div className="qb-surface-muted flex items-center gap-3 rounded-xl border qb-border px-4 py-3">
            <span className={`h-2.5 w-2.5 rounded-full ${healthStyle.dot}`} aria-hidden="true" />
            <div>
              <p className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${healthStyle.badge}`}>Base de datos: {healthStyle.label}</p>
              <p className="qb-text-muted mt-1 text-xs">{databaseHealth ? `${databaseHealth.latency_ms ?? '—'} ms · ${format(new Date(databaseHealth.checked_at), 'd MMM, HH:mm', { locale: es })}` : 'Sin comprobación reciente'}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><ShoppingBag className="h-7 w-7 text-blue-500" /><span className="qb-text text-3xl font-bold">{stats.todayOrders}</span></div><p className="qb-text-muted text-sm">Pedidos del día</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><TrendingUp className="h-7 w-7 text-emerald-500" /><span className="qb-text text-2xl font-bold">{currency(analytics?.summary.revenue ?? 0)}</span></div><p className="qb-text-muted text-sm">Ingresos confirmados · 30 días</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><CreditCard className="h-7 w-7 text-violet-500" /><span className="qb-text text-2xl font-bold">{currency(analytics?.summary.avg_ticket ?? 0)}</span></div><p className="qb-text-muted text-sm">Ticket promedio · 30 días</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><AlertTriangle className="h-7 w-7 text-amber-500" /><span className="qb-text text-3xl font-bold">{stockRisk.length}</span></div><p className="qb-text-muted text-sm">Productos bajo vigilancia</p></Card>
      </div>

      {(stats.outOfStock > 0 || stats.lowStock > 0 || stats.pendingOrders > 0 || stockRisk.length > 0) && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-red-500/30 bg-red-500/5 p-5">
            <div className="mb-3 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-red-500" /><h2 className="qb-text font-bold">Alertas operativas</h2></div>
            <div className="space-y-2 text-sm">
              {stats.outOfStock > 0 && <p className="qb-text-secondary">• {stats.outOfStock} producto(s) agotado(s).</p>}
              {stats.lowStock > 0 && <p className="qb-text-secondary">• {stats.lowStock} producto(s) con stock bajo (≤ 5).</p>}
              {stats.pendingOrders > 0 && <p className="qb-text-secondary">• {stats.pendingOrders} pedido(s) esperando procesamiento.</p>}
              {stockRisk.length > 0 && <p className="qb-text-secondary">• {stockRisk.length} producto(s) requieren revisión por riesgo de agotamiento.</p>}
            </div>
            <div className="mt-4 flex gap-2"><Link to="/admin/inventory"><Button size="sm">Revisar inventario</Button></Link><Link to="/admin/orders"><Button size="sm" variant="outline">Ver pedidos</Button></Link></div>
          </Card>
          <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-5">
            <div className="mb-3 flex items-center gap-3"><Sparkles className="h-5 w-5 text-[var(--qb-primary)]" /><h2 className="qb-text font-bold">Recomendación principal</h2></div>
            {stockRisk[0] ? (
              <div>
                <p className="qb-text text-lg font-semibold">{stockRisk[0].name}</p>
                <p className="qb-text-secondary mt-1 text-sm">Riesgo {riskLabel(stockRisk[0].risk_level).toLowerCase()}: {stockRisk[0].units_sold} unidades vendidas en 30 días y {stockRisk[0].stock} en stock.</p>
                <p className="qb-text-secondary mt-3 text-sm">Rotación estimada: {stockRisk[0].avg_daily_units.toFixed(2)} unidades por día.</p>
              </div>
            ) : <p className="qb-text-secondary text-sm">No hay productos con riesgo destacado en este momento.</p>}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className={surfaceCard}>
          <div className="mb-6 flex items-center justify-between"><div><h2 className="qb-text text-xl font-bold">Productos más vendidos</h2><p className="qb-text-muted mt-1 text-sm">Unidades vendidas con pago confirmado · 30 días</p></div><BarChart3 className="h-5 w-5 text-[var(--qb-primary)]" /></div>
          {topProducts.length === 0 ? <div className="py-10 text-center"><Package className="mx-auto mb-3 h-12 w-12 text-slate-400" /><p className="qb-text-muted text-sm">Aún no hay ventas confirmadas suficientes.</p></div> : <div className="space-y-4">{topProducts.map((product) => <div key={product.id}><div className="mb-1 flex items-center justify-between gap-3"><span className="qb-text text-sm font-semibold">{product.name}</span><span className="qb-text-muted text-sm">{product.units_sold} uds.</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[var(--qb-surface-muted)]"><div className="h-full rounded-full bg-[var(--qb-primary)]" style={{ width: `${Math.max(4, (product.units_sold / maxSales) * 100)}%` }} /></div><div className="mt-1 flex justify-between text-xs text-[var(--qb-text-muted)]"><span>{currency(product.revenue)}</span><span>Stock: {product.stock}</span></div></div>)}</div>}
        </Card>

        <Card className={surfaceCard}>
          <div className="mb-6 flex items-center justify-between"><div><h2 className="qb-text text-xl font-bold">Riesgo de agotamiento</h2><p className="qb-text-muted mt-1 text-sm">Prioridad calculada con stock y rotación.</p></div><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
          {stockRisk.length === 0 ? <div className="py-10 text-center"><CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-500" /><p className="qb-text-muted text-sm">No hay riesgos destacados.</p></div> : <div className="space-y-3">{stockRisk.slice(0, 6).map((product) => <div key={product.id} className="flex items-center justify-between gap-4 rounded-xl border qb-border qb-surface-muted p-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate qb-text font-semibold">{product.name}</span><Badge className={product.risk_level === 'critical' ? 'bg-red-500 text-white' : product.risk_level === 'high' ? 'bg-orange-500 text-white' : 'bg-amber-500 text-white'}>{riskLabel(product.risk_level)}</Badge></div><p className="qb-text-muted mt-1 text-xs">{product.units_sold} vendidos · {product.stock} disponibles · {product.avg_daily_units.toFixed(2)}/día</p></div><Link to="/admin/inventory"><Button size="sm" variant="outline">Revisar</Button></Link></div>)}</div>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className={surfaceCard}>
          <div className="mb-6 flex items-center justify-between"><div><h2 className="qb-text text-xl font-bold">Ingresos recientes</h2><p className="qb-text-muted mt-1 text-sm">Últimos 14 días con ventas confirmadas.</p></div><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
          {analytics?.daily.length ? <div className="space-y-3">{[...analytics.daily].reverse().map((day) => <div key={day.day} className="flex items-center gap-3"><span className="w-20 shrink-0 text-xs qb-text-muted">{format(new Date(`${day.day}T12:00:00`), 'd MMM', { locale: es })}</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--qb-surface-muted)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (day.revenue / maxDailyRevenue) * 100)}%` }} /></div><span className="w-28 shrink-0 text-right text-xs font-semibold qb-text-secondary">{currency(day.revenue)}</span></div>)}</div> : <p className="py-10 text-center qb-text-muted text-sm">Sin actividad de ventas para mostrar.</p>}
        </Card>

        <Card className={surfaceCard}>
          <div className="mb-6 flex items-center justify-between"><div><h2 className="qb-text text-xl font-bold">Movimientos de inventario</h2><p className="qb-text-muted mt-1 text-sm">Actividad registrada en los últimos 30 días.</p></div><Package className="h-5 w-5 text-blue-500" /></div>
          {analytics?.movement_summary.length ? <div className="grid grid-cols-2 gap-3">{analytics.movement_summary.map((movement) => <div key={movement.movement_type} className="rounded-xl border qb-border qb-surface-muted p-4"><div className="flex items-center justify-between gap-2"><span className="qb-text text-sm font-semibold">{movementLabel(movement.movement_type)}</span>{movement.movement_type === 'sale' ? <ArrowDownRight className="h-4 w-4 text-blue-500" /> : <ArrowUpRight className="h-4 w-4 text-emerald-500" />}</div><p className="qb-text mt-2 text-2xl font-bold">{movement.quantity}</p><p className="qb-text-muted text-xs">unidades</p></div>)}</div> : <p className="py-10 text-center qb-text-muted text-sm">Aún no hay movimientos registrados.</p>}
        </Card>
      </div>
    </div>
  );
}
