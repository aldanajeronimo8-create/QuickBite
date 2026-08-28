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
        // Health information is supplementary: a failed dashboard read must
        // never interfere with sales, orders or inventory.
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
    const todayOrders = operationalOrders.filter(
      (o) => new Date(o.created_at) >= today
    );

    const confirmedPayments = todayOrders.filter(
      (o) => o.payment_status === 'confirmed'
    ).length;

    const totalRevenue = todayOrders
      .filter((o) => o.payment_status === 'confirmed')
      .reduce((sum, o) => sum + o.total, 0);

    const outOfStock = products.filter((p) => p.stock === 0 && p.available).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5 && p.available).length;

    const pendingOrders = operationalOrders.filter((o) => o.status === 'pending').length;
    const preparingOrders = operationalOrders.filter((o) => o.status === 'preparing').length;

    return {
      todayOrders: todayOrders.length,
      confirmedPayments,
      totalRevenue,
      outOfStock,
      lowStock,
      pendingOrders,
      preparingOrders,
    };
  }, [orders, products]);

  const recentOrders = useMemo(() => {
    return orders
      .filter((order) => !order.admin_hidden)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [orders]);

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
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" style={{ color: '#1E3A8A' }}>Dashboard</h1>
        <p className="text-gray-600 text-lg">
          Vista general del sistema QuickBite
        </p>
      </div>

      <Card className="mb-8 border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Estado del sistema</h2>
              <p className="mt-1 text-sm text-slate-600">
                Base de datos, comprobación de salud y última latencia registrada.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className={`h-2.5 w-2.5 rounded-full ${healthStyle.dot}`} aria-hidden="true" />
            <div>
              <p className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${healthStyle.badge}`}>
                Base de datos: {healthStyle.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {databaseHealth
                  ? `${databaseHealth.latency_ms ?? '—'} ms · ${format(new Date(databaseHealth.checked_at), "d MMM, HH:mm", { locale: es })}`
                  : 'El monitor registrará el próximo resultado.'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-8 border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-blue-950">Puntos de estudiantes</h2>
              <p className="mt-1 max-w-2xl text-base leading-7 text-gray-700">
                Activa o desactiva la pestaña de recompensas en la app del estudiante.
                Cuando está apagado, los alumnos no ven puntos ni premios.
              </p>
            </div>
          </div>
          <Link to="/admin/loyalty"><Button className="bg-blue-700 text-white hover:bg-blue-800">Gestionar puntos</Button></Link>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <ShoppingBag className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-slate-900">{stats.todayOrders}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Pedidos del día</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-slate-900">{stats.confirmedPayments}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Pagos confirmados</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-teal-700" />
            <span className="text-2xl font-bold text-slate-900">${(stats.totalRevenue / 1000).toFixed(0)}K</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Ingresos del día</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <span className="text-3xl font-bold text-slate-900">{stats.outOfStock}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Productos agotados</p>
        </Card>
      </div>

      {/* Alerts */}
      {(stats.outOfStock > 0 || stats.lowStock > 0 || stats.pendingOrders > 0) && (
        <div className="mb-8 space-y-3">
          {stats.pendingOrders > 0 && (
            <Card className="border-l-4 border-blue-600 bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600" />
                  <p className="font-medium text-blue-900">
                    Tienes {stats.pendingOrders} pedido(s) pendiente(s) por procesar
                  </p>
                </div>
                <Link to="/admin/orders">
                  <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                    Ver pedidos
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {stats.outOfStock > 0 && (
            <Card className="p-4 bg-red-50 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-red-600" />
                  <p className="text-red-800 font-medium">
                    {stats.outOfStock} producto(s) sin stock
                  </p>
                </div>
                <Link to="/admin/inventory">
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                    Ver inventario
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {stats.lowStock > 0 && (
            <Card className="border-l-4 border-amber-500 bg-amber-50 p-4">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-amber-600" />
                <p className="font-medium text-amber-900">
                  {stats.lowStock} producto(s) con stock bajo (≤5 unidades)
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Recent Orders */}
      <Card className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-blue-900">Actividad reciente</h2>
          <Link to="/admin/orders">
            <Button variant="outline" size="sm" className="border-blue-600 text-blue-700 hover:bg-blue-50">
              Ver todos
            </Button>
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No hay pedidos aún</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-green-700">{order.order_number}</span>
                    {getStatusBadge(order.status)}
                    <Badge
                      className={
                        order.payment_status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : order.payment_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      Pago: {order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'pending' ? 'Pendiente' : 'Rechazado'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    {format(new Date(order.created_at), "d 'de' MMMM - HH:mm", { locale: es })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-900">
                    ${order.total.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {order.payment_method === 'cash' ? 'Efectivo' : order.payment_method}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
