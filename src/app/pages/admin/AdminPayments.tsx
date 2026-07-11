import { useMemo, useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { CheckCircle, XCircle, Clock, CreditCard, Banknote, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export function AdminPayments() {
  const { orders, updateOrder } = useDataStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredOrders = useMemo(() => {
    let filtered = [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    if (filterStatus !== 'all') {
      filtered = filtered.filter((o) => o.payment_status === filterStatus);
    }

    return filtered;
  }, [orders, filterStatus]);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.payment_status === 'pending').length;
    const confirmed = orders.filter((o) => o.payment_status === 'confirmed').length;
    const rejected = orders.filter((o) => o.payment_status === 'rejected').length;
    const totalConfirmed = orders
      .filter((o) => o.payment_status === 'confirmed')
      .reduce((sum, o) => sum + o.total, 0);

    const pendingCash = orders.filter(
      (o) => o.payment_method === 'cash' && o.payment_status === 'pending',
    );

    return { pending, confirmed, rejected, totalConfirmed, pendingCash };
  }, [orders]);

  const handleConfirmPayment = async (orderId: string) => {
    try {
      const order = orders.find((item) => item.id === orderId);
      await updateOrder(orderId, {
        payment_status: 'confirmed',
        ...(order?.payment_method === 'cash' && order.status === 'pending'
          ? { status: 'preparing' }
          : {}),
      });
      toast.success(
        order?.payment_method === 'cash'
          ? 'Efectivo confirmado. El pedido pasó a preparación.'
          : 'Pago confirmado exitosamente',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo confirmar el pago');
    }
  };

  const handleRejectPayment = async (orderId: string) => {
    try {
      await updateOrder(orderId, { payment_status: 'rejected' });
      toast.error('Pago rechazado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo rechazar el pago');
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'Pendiente', className: 'bg-yellow-500 text-white' },
      confirmed: { label: 'Confirmado', className: 'bg-green-500 text-white' },
      rejected: { label: 'Rechazado', className: 'bg-red-500 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-blue-900 mb-2">Gestión de Pagos</h1>
        <p className="text-gray-600 text-lg">Confirma o rechaza pagos pendientes</p>
      </div>

      {stats.pendingCash.length > 0 && (
        <Card className="mb-8 border-2 border-emerald-200 bg-emerald-50 p-6 shadow-lg">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-600 p-3 text-white">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-950">Efectivo por confirmar</h2>
                <p className="text-sm text-emerald-800">
                  Confirma el pago recibido para enviar el pedido a preparación.
                </p>
              </div>
            </div>
            <Badge className="bg-emerald-600 text-white">{stats.pendingCash.length} pendiente(s)</Badge>
          </div>
          <div className="space-y-3">
            {stats.pendingCash.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
                <div>
                  <p className="font-bold text-emerald-900">{order.order_number}</p>
                  <p className="text-sm text-slate-600">
                    {order.user?.full_name ?? 'Estudiante'} · {order.order_items
                      ?.map((item) => `${item.quantity}× ${item.product?.name ?? 'Producto'}`)
                      .join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <b className="text-lg text-blue-900">${order.total.toLocaleString()}</b>
                  <Button onClick={() => handleConfirmPayment(order.id)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirmar efectivo
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="p-6 bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.pending}</span>
          </div>
          <p className="text-yellow-100 text-sm font-medium">Pagos Pendientes</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.confirmed}</span>
          </div>
          <p className="text-green-100 text-sm font-medium">Pagos Confirmados</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <XCircle className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.rejected}</span>
          </div>
          <p className="text-red-100 text-sm font-medium">Pagos Rechazados</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">${(stats.totalConfirmed / 1000).toFixed(0)}K</span>
          </div>
          <p className="text-blue-100 text-sm font-medium">Total Confirmado</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6 bg-white shadow-lg border-0 mb-6">
        <div className="flex items-center gap-4">
          <label className="font-medium text-gray-700">Filtrar por estado:</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pagos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="confirmed">Confirmados</SelectItem>
              <SelectItem value="rejected">Rechazados</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <span className="text-sm text-gray-600">
              Total: <span className="font-bold text-blue-900">{filteredOrders.length}</span>{' '}
              pago(s)
            </span>
          </div>
        </div>
      </Card>

      {/* Payments List */}
      {filteredOrders.length === 0 ? (
        <Card className="p-12 bg-white text-center border-0 shadow-lg">
          <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No hay pagos para mostrar</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="p-6 bg-white shadow-lg border-0 hover:shadow-xl transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3>
                    {getPaymentStatusBadge(order.payment_status)}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", {
                      locale: es,
                    })}
                  </p>
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                    <UserRound className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold">Estudiante:</span>
                    <span>{order.user?.full_name ?? 'No disponible'}</span>
                    {order.user?.ti && <span className="text-gray-500">TI {order.user.ti}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Método: </span>
                      <span className="font-medium capitalize">
                        {order.payment_method === 'cash' ? 'Efectivo' : order.payment_method}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Artículos: </span>
                      <span className="font-medium">
                        {order.order_items?.reduce(
                          (sum: number, item: any) => sum + item.quantity,
                          0,
                        ) || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-1">Total</p>
                  <p className="text-3xl font-bold text-blue-900 mb-3">
                    ${order.total.toLocaleString()}
                  </p>

                  {order.payment_status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleConfirmPayment(order.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {order.payment_method === 'cash' ? 'Confirmar efectivo' : 'Confirmar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectPayment(order.id)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Rechazar
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items Summary */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Resumen del pedido:</p>
                <div className="flex flex-wrap gap-2">
                  {order.order_items?.map((item: any, index: number) => (
                    <Badge key={index} variant="outline" className="bg-gray-50">
                      {item.quantity}x {item.product?.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
