import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ShoppingBag, CreditCard, Package, TrendingUp, AlertTriangle, CheckCircle, Star, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SystemHealthCheck } from '../../../lib/supabase';
import { getSystemHealthSummary } from '../../../repositories/quickbiteRepository';

const surfaceCard = 'border qb-border qb-surface p-6 shadow-sm';
const secondarySurface = 'qb-surface-muted';

export function AdminDashboard() {
  const { orders, products } = useDataStore();
  const [health, setHealth] = useState<SystemHealthCheck[]>([]);

  useEffect(() => {
    let active = true;
    const loadHealth = async () => {
      try {
        const currentHealth = await getSystemHealthSummary();
        if (active) setHealth(currentHealth);
      } catch {
        if (active) setHealth([]);
      }
    };
    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const operationalOrders = orders.filter((order) => !order.admin_hidden);
    const todayOrders = operationalOrders.filter((o) => new Date(o.created_at) >= today);
    const confirmedPayments = todayOrders.filter((o) => o.payment_status === 'confirmed').length;
    const totalRevenue = todayOrders.filter((o) => o.payment_status === 'confirmed').reduce((sum, o) => sum + o.total, 0);
    const outOfStock = products.filter((p) => p.stock === 0 && p.available).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5 && p.available).length;
    const pendingOrders = operationalOrders.filter((o) => o.status === 'pending').length;
    const preparingOrders = operationalOrders.filter((o) => o.status === 'preparing').length;
    return { todayOrders: todayOrders.length, confirmedPayments, totalRevenue, outOfStock, lowStock, pendingOrders, preparingOrders };
  }, [orders, products]);

  const recentOrders = useMemo(() => orders.filter((order) => !order.admin_hidden).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [orders]);
  const databaseHealth = health.find((check) => check.service === 'supabase_database');
  const healthStyle = databaseHealth?.status === 'healthy'
    ? { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', label: 'Operativo' }
    : databaseHealth?.status === 'degraded'
      ? { badge: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500', label: 'Degradado' }
      : databaseHealth?.status === 'unhealthy'
        ? { badge: 'bg-red-100 text-red-800', dot: 'bg-red-500', label: 'Con problema' }
        : { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', label: 'Sin comprobación' };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'Pendiente', className: 'bg-blue-600 text-white' },
      preparing: { label: 'Preparando', className: 'bg-amber-500 text-white' },
      ready: { label: 'Listo', className: 'bg-green-600 text-white' },
      delivered: { label: 'Entregado', className: 'bg-green-800 text-white' },
      cancelled: { label: 'Cancelado', className: 'bg-red-600 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold text-[var(--qb-primary)]">Dashboard</h1>
        <p className="qb-text-secondary text-lg">Vista general del sistema QuickBite</p>
      </div>

      <Card className="mb-8 border qb-border qb-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="qb-surface-elevated rounded-xl p-2.5 qb-text-secondary"><Activity className="h-5 w-5" /></div>
            <div>
              <h2 className="qb-text font-bold">Estado del sistema</h2>
              <p className="qb-text-secondary mt-1 text-sm">Base de datos, comprobación de salud y última latencia registrada.</p>
            </div>
          </div>
          <div className="qb-surface-muted flex items-center gap-3 rounded-xl border qb-border px-4 py-3">
            <span className={`h-2.5 w-2.5 rounded-full ${healthStyle.dot}`} aria-hidden="true" />
            <div>
              <p className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${healthStyle.badge}`}>Base de datos: {healthStyle.label}</p>
              <p className="qb-text-muted mt-1 text-xs">{databaseHealth ? `${databaseHealth.latency_ms ?? '—'} ms · ${format(new Date(databaseHealth.checked_at), 'd MMM, HH:mm', { locale: es })}` : 'El monitor registrará el próximo resultado.'}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-8 border qb-border qb-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:border dark:border-blue-300/20 dark:bg-blue-500/15 dark:text-blue-200"><Star className="h-6 w-6" /></div>
            <div>
              <h2 className="qb-text text-2xl font-bold">Puntos de estudiantes</h2>
              <p className="qb-text-secondary mt-1 max-w-2xl text-base leading-7">Activa o desactiva la pestaña de recompensas en la app del estudiante. Cuando está apagado, los alumnos no ven puntos ni premios.</p>
            </div>
          </div>
          <Link to="/admin/loyalty"><Button className="bg-[var(--qb-primary)] text-white hover:brightness-95">Gestionar puntos</Button></Link>
        </div>
      </Card>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><ShoppingBag className="h-8 w-8 text-blue-600 dark:text-blue-300"/><span className="qb-text text-3xl font-bold">{stats.todayOrders}</span></div><p className="qb-text-muted text-sm font-medium">Pedidos del día</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><CreditCard className="h-8 w-8 text-green-600 dark:text-green-300"/><span className="qb-text text-3xl font-bold">{stats.confirmedPayments}</span></div><p className="qb-text-muted text-sm font-medium">Pagos confirmados</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><TrendingUp className="h-8 w-8 text-teal-700 dark:text-teal-300"/><span className="qb-text text-2xl font-bold">${(stats.totalRevenue / 1000).toFixed(0)}K</span></div><p className="qb-text-muted text-sm font-medium">Ingresos del día</p></Card>
        <Card className={surfaceCard}><div className="mb-2 flex items-center justify-between"><AlertTriangle className="h-8 w-8 text-amber-500"/><span className="qb-text text-3xl font-bold">{stats.outOfStock}</span></div><p className="qb-text-muted text-sm font-medium">Productos agotados</p></Card>
      </div>

      {(stats.outOfStock > 0 || stats.lowStock > 0 || stats.pendingOrders > 0) && <div className="mb-8 space-y-3">
        {stats.pendingOrders > 0 && <Card className="border-l-4 border-blue-600 bg-blue-50 p-4 dark:border-blue-400 dark:bg-blue-500/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-300"/><p className="font-medium text-blue-900 dark:text-blue-100">Tienes {stats.pendingOrders} pedido(s) pendiente(s) por procesar</p></div><Link to="/admin/orders"><Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">Ver pedidos</Button></Link></div></Card>}
        {stats.outOfStock > 0 && <Card className="border-l-4 border-red-500 bg-red-50 p-4 dark:border-red-400 dark:bg-red-500/10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Package className="h-5 w-5 text-red-600 dark:text-red-300"/><p className="font-medium text-red-800 dark:text-red-100">{stats.outOfStock} producto(s) sin stock</p></div><Link to="/admin/inventory"><Button size="sm" className="bg-red-600 text-white hover:bg-red-700">Ver inventario</Button></Link></div></Card>}
        {stats.lowStock > 0 && <Card className="border-l-4 border-amber-500 bg-amber-50 p-4 dark:border-amber-400 dark:bg-amber-500/10"><div className="flex items-center gap-3"><Package className="h-5 w-5 text-amber-600 dark:text-amber-300"/><p className="font-medium text-amber-900 dark:text-amber-100">{stats.lowStock} producto(s) con stock bajo (≤5 unidades)</p></div></Card>}
      </div>}

      <Card className="border qb-border qb-surface p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="qb-text text-2xl font-bold">Actividad reciente</h2>
          <Link to="/admin/orders"><Button variant="outline" size="sm" className="border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-300/40 dark:text-blue-200 dark:hover:bg-blue-500/10">Ver todos</Button></Link>
        </div>
        {recentOrders.length === 0 ? <div className="py-12 text-center"><CheckCircle className="mx-auto mb-4 h-16 w-16 text-gray-300 dark:text-slate-500"/><p className="qb-text-muted">No hay pedidos aún</p></div> : <div className="space-y-4">
          {recentOrders.map((order) => <div key={order.id} className={`flex items-center justify-between rounded-xl border qb-border ${secondarySurface} p-4 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800`}>
            <div className="flex-1"><div className="mb-1 flex items-center gap-3"><span className="font-bold text-green-700 dark:text-green-300">{order.order_number}</span>{getStatusBadge(order.status)}<Badge className={order.payment_status === 'confirmed' ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200' : order.payment_status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100' : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-100'}>Pago: {order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'pending' ? 'Pendiente' : 'Rechazado'}</Badge></div><p className="qb-text-secondary text-sm">{format(new Date(order.created_at), "d 'de' MMMM - HH:mm", { locale: es })}</p></div>
            <div className="text-right"><p className="text-xl font-bold text-[var(--qb-primary)]">${order.total.toLocaleString()}</p><p className="qb-text-muted text-xs capitalize">{order.payment_method === 'cash' ? 'Efectivo' : order.payment_method}</p></div>
          </div>)}
        </div>}
      </Card>
    </div>
  );
}
