import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  ShoppingBag,
  CreditCard,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Star,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function AdminDashboard() {
  const { orders, products } = useDataStore();
  const rewardsEnabled = true;

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter((o) => new Date(o.created_at) >= today);

    const confirmedPayments = todayOrders.filter((o) => o.payment_status === 'confirmed').length;

    const totalRevenue = todayOrders
      .filter((o) => o.payment_status === 'confirmed')
      .reduce((sum, o) => sum + o.total, 0);

    const outOfStock = products.filter((p) => p.stock === 0 && p.available).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5 && p.available).length;

    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    const preparingOrders = orders.filter((o) => o.status === 'preparing').length;

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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [orders]);

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'Pendiente', className: 'bg-yellow-500 text-white' },
      preparing: { label: 'Preparando', className: 'bg-blue-500 text-white' },
      ready: { label: 'Listo', className: 'bg-green-500 text-white' },
      delivered: { label: 'Entregado', className: 'bg-gray-500 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" style={{ color: '#1E3A8A' }}>
          Dashboard
        </h1>
        <p className="text-gray-600 text-lg">Vista general del sistema QuickBite</p>
      </div>

      <Card className="mb-8 border-0 bg-white p-6 shadow-lg ring-1 ring-blue-900/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-blue-950">Puntos de estudiantes</h2>
              <p className="mt-1 max-w-2xl text-base leading-7 text-gray-700">
                Activa o desactiva la pestaña de recompensas en la app del estudiante. Cuando está
                apagado, los alumnos no ven puntos ni premios.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-blue-50 px-5 py-4">
            <span className="font-bold text-blue-950">
              {rewardsEnabled ? 'Activado' : 'Desactivado'}
            </span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              Supabase
            </span>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <ShoppingBag className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.todayOrders}</span>
          </div>
          <p className="text-blue-100 text-sm font-medium">Pedidos del Día</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.confirmedPayments}</span>
          </div>
          <p className="text-green-100 text-sm font-medium">Pagos Confirmados</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">${(stats.totalRevenue / 1000).toFixed(0)}K</span>
          </div>
          <p className="text-purple-100 text-sm font-medium">Ingresos del Día</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.outOfStock}</span>
          </div>
          <p className="text-orange-100 text-sm font-medium">Productos Agotados</p>
        </Card>
      </div>

      {/* Alerts */}
      {(stats.outOfStock > 0 || stats.lowStock > 0 || stats.pendingOrders > 0) && (
        <div className="mb-8 space-y-3">
          {stats.pendingOrders > 0 && (
            <Card className="p-4 bg-yellow-50 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <p className="text-yellow-800 font-medium">
                    Tienes {stats.pendingOrders} pedido(s) pendiente(s) por procesar
                  </p>
                </div>
                <Link to="/admin/orders">
                  <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white">
                    Ver Pedidos
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
                    Ver Inventario
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {stats.lowStock > 0 && (
            <Card className="p-4 bg-orange-50 border-l-4 border-orange-500">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-orange-600" />
                <p className="text-orange-800 font-medium">
                  {stats.lowStock} producto(s) con stock bajo (≤5 unidades)
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Recent Orders */}
      <Card className="p-6 bg-white shadow-lg border-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-blue-900">Actividad Reciente</h2>
          <Link to="/admin/orders">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-600 text-blue-700 hover:bg-blue-50"
            >
              Ver Todos
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
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
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
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }
                    >
                      Pago:{' '}
                      {order.payment_status === 'confirmed'
                        ? 'Confirmado'
                        : order.payment_status === 'pending'
                          ? 'Pendiente'
                          : 'Rechazado'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    {format(new Date(order.created_at), "d 'de' MMMM - HH:mm", { locale: es })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-900">${order.total.toLocaleString()}</p>
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
