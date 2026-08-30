import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, Eye, EyeOff, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { downloadActiveSalesExcel } from '../../../services/orderExportService';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { Order } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const statusLabels: Record<Order['status'], { label: string; className: string }> = {
  pending: { label: 'Pedido recibido', className: 'bg-blue-600 text-white' },
  preparing: { label: 'En preparación', className: 'bg-amber-500 text-white' },
  ready: { label: 'Listo para recoger', className: 'bg-green-600 text-white' },
  delivered: { label: 'Entregado', className: 'bg-green-800 text-white' },
};

const paymentLabels: Record<Order['payment_status'], { label: string; className: string }> = {
  confirmed: { label: 'Confirmado', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800' },
};

function getOrderErrorMessage(error: unknown) {
  const message = getErrorMessage(error, 'No se pudo completar la operación con Supabase');
  if (message.includes('admin_hidden') || message.includes('column')) {
    return 'Falta aplicar la migración necesaria en Supabase. Ejecuta las migraciones pendientes y vuelve a intentarlo.';
  }
  if (/not_authorized|row-level security|permission denied/i.test(message)) {
    return 'Tu sesión no tiene permisos de administrador para actualizar pedidos.';
  }
  return message;
}

function getStatusBadge(status: Order['status']) {
  const statusConfig = statusLabels[status] ?? statusLabels.pending;
  return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
}

function getPaymentBadge(status: Order['payment_status']) {
  const paymentConfig = paymentLabels[status] ?? paymentLabels.pending;
  return <Badge className={paymentConfig.className}>Pago: {paymentConfig.label}</Badge>;
}

function getItemsCount(order: Order) {
  return order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

export function AdminOrders() {
  const { orders, updateOrder, resetOrdersForNewPeriod } = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [confirmingExport, setConfirmingExport] = useState(false);

  const hiddenCount = useMemo(() => orders.filter((order) => order.admin_hidden).length, [orders]);
  const salesTotal = useMemo(
    () => orders.reduce((total, order) => total + Number(order.total || 0), 0),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let filtered = orders
      .filter((order) => (showHidden ? order.admin_hidden : !order.admin_hidden))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filterStatus !== 'all') {
      filtered = filtered.filter((order) => order.status === filterStatus);
    }

    return filtered;
  }, [orders, filterStatus, showHidden]);

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(orderId);
    try {
      await updateOrder(orderId, { status: newStatus });
      toast.success('Estado del pedido actualizado');
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (error) {
      toast.error(getOrderErrorMessage(error));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleHiddenChange = async (order: Order, hidden: boolean) => {
    try {
      await updateOrder(order.id, { admin_hidden: hidden });
      toast.success(hidden ? 'Pedido archivado en Administración' : 'Pedido restaurado en Administración');
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...selectedOrder, admin_hidden: hidden });
      }
    } catch (error) {
      toast.error(getOrderErrorMessage(error));
    }
  };

  const handleExcelDownload = async () => {
    if (closingPeriod || orders.length === 0) return;
    setClosingPeriod(true);

    try {
      const result = await downloadActiveSalesExcel(orders);
      const resetCount = await resetOrdersForNewPeriod();
      setSelectedOrder(null);
      setShowHidden(false);
      setConfirmingExport(false);
      toast.success(
        `Se descargó el Excel con ${result.count} ventas y se reiniciaron ${resetCount} pedidos. El inventario no cambió.`,
      );
    } catch (error) {
      toast.error(getOrderErrorMessage(error));
    } finally {
      setClosingPeriod(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold text-blue-900">Gestión de pedidos</h1>
          <p className="text-lg text-gray-600">
            Administra pedidos y exporta el historial completo. Al cerrar el período se eliminan todos los pedidos de la aplicación, incluidos los archivados, sin modificar el inventario.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => setConfirmingExport(true)}
            disabled={closingPeriod || orders.length === 0}
            className="bg-blue-700 text-white hover:bg-blue-800"
          >
            <Download className="h-4 w-4" />
            Exportar Excel y reiniciar período
          </Button>
        </div>
      </div>

      <Card className="mb-6 border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="font-medium text-gray-700">Filtrar por estado:</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pedidos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="preparing">En preparación</SelectItem>
              <SelectItem value="ready">Listos</SelectItem>
              <SelectItem value="delivered">Entregados</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowHidden((value) => !value)}
            className="border-blue-600 text-blue-700 hover:bg-blue-50"
          >
            {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showHidden ? 'Ver ventas activas' : `Ver ventas archivadas (${hiddenCount})`}
          </Button>

          <div className="ml-auto">
            <span className="text-sm text-gray-600">
              Total: <span className="font-bold text-blue-900">{filteredOrders.length}</span> pedido(s)
            </span>
          </div>
        </div>
      </Card>

      {filteredOrders.length === 0 ? (
        <Card className="border border-slate-200 bg-white p-12 text-center shadow-sm">
          <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <p className="text-lg text-gray-500">No hay pedidos para mostrar</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3>
                    {getStatusBadge(order.status)}
                    {getPaymentBadge(order.payment_status)}
                    {order.admin_hidden && <Badge className="bg-slate-200 text-slate-700">Archivado</Badge>}
                  </div>
                  <p className="mb-3 text-sm text-gray-600">{format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="font-medium">Artículos:</span>
                    <span>{getItemsCount(order)} unidades</span>
                  </div>
                  {order.comment && (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-bold">Comentario:</span> {order.comment}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <p className="mb-1 text-sm text-gray-600">Total</p>
                  <p className="mb-3 text-3xl font-bold text-blue-900">${Number(order.total).toLocaleString()}</p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                      Ver detalles
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleHiddenChange(order, !order.admin_hidden)}
                      className={order.admin_hidden ? 'border-green-600 text-green-700 hover:bg-green-50' : 'border-slate-500 text-slate-700 hover:bg-slate-50'}
                    >
                      {order.admin_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      {order.admin_hidden ? 'Restaurar' : 'Archivar'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">Cambiar estado:</span>
                  <div className="flex flex-wrap gap-2">
                    {order.status !== 'pending' && <Button size="sm" variant="outline" onClick={() => handleStatusChange(order.id, 'pending')} disabled={updatingOrderId === order.id} className="border-blue-500 text-blue-700 hover:bg-blue-50">Pendiente</Button>}
                    {order.status !== 'preparing' && <Button size="sm" onClick={() => handleStatusChange(order.id, 'preparing')} disabled={updatingOrderId === order.id} className="bg-amber-500 text-white hover:bg-amber-600">En preparación</Button>}
                    {order.status !== 'ready' && <Button size="sm" onClick={() => handleStatusChange(order.id, 'ready')} disabled={updatingOrderId === order.id} className="bg-green-600 text-white hover:bg-green-700">Listo</Button>}
                    {order.status !== 'delivered' && <Button size="sm" onClick={() => handleStatusChange(order.id, 'delivered')} disabled={updatingOrderId === order.id} className="bg-green-800 text-white hover:bg-green-900">Entregado</Button>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="text-2xl">Detalles del pedido</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="mb-1 text-sm text-gray-600">Número de orden</p><p className="text-xl font-bold text-green-700">{selectedOrder.order_number}</p></div>
                <div><p className="mb-1 text-sm text-gray-600">Total</p><p className="text-xl font-bold text-blue-900">${Number(selectedOrder.total).toLocaleString()}</p></div>
                <div><p className="mb-1 text-sm text-gray-600">Estado</p>{getStatusBadge(selectedOrder.status)}</div>
                <div><p className="mb-1 text-sm text-gray-600">Método de pago</p><p className="font-medium capitalize">{selectedOrder.payment_method === 'cash' ? 'Efectivo' : selectedOrder.payment_method}</p></div>
              </div>

              {selectedOrder.comment && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="mb-1 text-lg font-bold text-amber-900">Comentario del estudiante</h3>
                  <p className="text-sm text-amber-900">{selectedOrder.comment}</p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-lg font-bold text-blue-900">Artículos del pedido</h3>
                <div className="space-y-2">
                  {selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">{item.quantity}</span>
                        <div><p className="font-medium">{item.product?.name}</p><p className="text-sm text-gray-600">${Number(item.price).toLocaleString()} c/u</p></div>
                      </div>
                      <span className="font-bold text-blue-900">${Number(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingExport} onOpenChange={(open) => !closingPeriod && setConfirmingExport(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Exportar ventas a Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-slate-700">
            <p>¿Deseas exportar las ventas actuales a excel y reiniciar la gestión de pagos?</p>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p><strong>{orders.length}</strong> venta(s) serán exportadas.</p>
              <p><strong>${salesTotal.toLocaleString('es-CO')}</strong> es el total del período.</p>
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Después del reinicio, estas ventas dejarán de aparecer en Gestión de Pagos. No se modificará nada si excel no confirma la recepción completa.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={closingPeriod} onClick={() => setConfirmingExport(false)}>Cancelar</Button>
            <Button disabled={closingPeriod || orders.length === 0} onClick={handleExcelDownload} className="bg-blue-700 text-white hover:bg-blue-800">
              {closingPeriod ? 'Exportando...' : 'Exportar y reiniciar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
