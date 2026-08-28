import { useMemo, useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CheckCircle, XCircle, Clock, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export function AdminPayments() {
  const { orders, updateOrder } = useDataStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter((order) => !order.admin_hidden).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (filterStatus !== 'all') {
      filtered = filtered.filter((o) => o.payment_status === filterStatus);
    }

    return filtered;
  }, [orders, filterStatus]);

  const stats = useMemo(() => {
    const activeOrders = orders.filter((order) => !order.admin_hidden);
    const pending = activeOrders.filter((o) => o.payment_status === 'pending').length;
    const confirmed = activeOrders.filter((o) => o.payment_status === 'confirmed').length;
    const rejected = activeOrders.filter((o) => o.payment_status === 'rejected').length;
    const totalConfirmed = activeOrders
      .filter((o) => o.payment_status === 'confirmed')
      .reduce((sum, o) => sum + o.total, 0);

    return { pending, confirmed, rejected, totalConfirmed };
  }, [orders]);

  const handleConfirmPayment = async (orderId: string) => {
    try {
      await updateOrder(orderId, { payment_status: 'confirmed' });
      toast.success('Pago confirmado exitosamente');
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
      pending: { label: 'Pendiente', className: 'bg-amber-500 text-white' },
      confirmed: { label: 'Confirmado', className: 'bg-green-600 text-white' },
      rejected: { label: 'Rechazado', className: 'bg-red-500 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-blue-900 mb-2">Gestión de pagos</h1>
        <p className="text-gray-600 text-lg">
          Confirma o rechaza pagos pendientes
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-amber-500" />
            <span className="text-3xl font-bold text-slate-900">{stats.pending}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Pagos pendientes</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-slate-900">{stats.confirmed}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Pagos confirmados</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <XCircle className="w-8 h-8 text-red-600" />
            <span className="text-3xl font-bold text-slate-900">{stats.rejected}</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Pagos rechazados</p>
        </Card>

        <Card className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-slate-900">${(stats.totalConfirmed / 1000).toFixed(0)}K</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Total confirmado</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 border border-slate-200 bg-white p-6 shadow-sm">
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
              Total: <span className="font-bold text-blue-900">{filteredOrders.length}</span> pago(s)
            </span>
          </div>
        </div>
      </Card>

      {/* Payments List */}
      {filteredOrders.length === 0 ? (
        <Card className="border border-slate-200 bg-white p-12 text-center shadow-sm">
          <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No hay pagos para mostrar</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3>
                    {getPaymentStatusBadge(order.payment_status)}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                  </p>
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
                        {order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0}
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
                        Confirmar
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
