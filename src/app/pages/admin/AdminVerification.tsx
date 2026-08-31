import { useMemo, useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ScanLine, CheckCircle, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getOrderVerificationUrl } from '../../../lib/orderQr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order } from '../../../lib/supabase';

export function AdminVerification() {
  const { orders, updateOrder } = useDataStore();
  const [orderNumber, setOrderNumber] = useState('');
  const [verifiedOrder, setVerifiedOrder] = useState<Order | null>(null);

  const recentOrders = useMemo(() => orders
    .filter((order) => !order.admin_hidden && order.status !== 'delivered' && order.status !== 'cancelled')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10), [orders]);

  const hasActiveVerifiedOrder = Boolean(
    verifiedOrder && orders.some((order) => order.id === verifiedOrder.id && !order.admin_hidden && order.status !== 'cancelled'),
  );

  const handleSearch = () => {
    if (!orderNumber.trim()) {
      toast.error('Ingresa un número de orden o código de recogida');
      return;
    }
    const term = orderNumber.trim().toLowerCase();
    const order = orders.find((o) => !o.admin_hidden && o.status !== 'cancelled' && (o.order_number.toLowerCase() === term || (o.pickup_code ?? '').toLowerCase() === term));
    if (!order) {
      toast.error('Pedido no encontrado');
      setVerifiedOrder(null);
      return;
    }
    setVerifiedOrder(order);
    toast.success('Pedido encontrado');
  };

  const handleMarkAsDelivered = async () => {
    if (!verifiedOrder) return;
    try {
      await updateOrder(verifiedOrder.id, { status: 'delivered' });
      toast.success('Pedido marcado como entregado');
      setVerifiedOrder({ ...verifiedOrder, status: 'delivered' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo marcar como entregado');
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'Pendiente', className: 'bg-blue-600 text-white' },
      preparing: { label: 'En Preparación', className: 'bg-amber-500 text-white' },
      ready: { label: 'Listo para Recoger', className: 'bg-green-600 text-white' },
      delivered: { label: 'Entregado', className: 'bg-green-800 text-white' },
      cancelled: { label: 'Cancelado', className: 'bg-red-600 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-blue-900 mb-2">Verificación de Pedidos</h1>
        <p className="text-gray-600 text-lg">Verifica el QR o ingresa el número/código de recogida.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card className="p-6 bg-white shadow-lg border-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"><ScanLine className="w-6 h-6 text-blue-600" /></div>
            <div><h2 className="text-xl font-bold text-blue-900">Buscar Pedido</h2><p className="text-sm text-gray-600">Ingresa el número de orden o código de recogida.</p></div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="orderNumber">Número o código de recogida</Label>
              <div className="flex gap-2 mt-2">
                <Input id="orderNumber" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} placeholder="QB123456 o A1B2" className="flex-1 text-lg font-mono" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 text-white"><Search className="w-5 h-5" /></Button>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded"><p className="text-sm text-blue-800">💡 <strong>Tip:</strong> el QR de Student y el QR mostrado aquí usan el mismo código persistente del pedido.</p></div>
          </div>
        </Card>

        <Card className="p-6 bg-white shadow-lg border-0">
          <h2 className="text-xl font-bold text-blue-900 mb-4">Pedidos Recientes</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentOrders.map((order) => (
              <button key={order.id} onClick={() => { setOrderNumber(order.order_number); setVerifiedOrder(order); }} className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition text-left">
                <div className="flex items-center justify-between"><div><span className="font-bold text-green-700">{order.order_number}</span><p className="text-xs text-gray-600">{format(new Date(order.created_at), 'HH:mm', { locale: es })}</p></div>{getStatusBadge(order.status)}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {verifiedOrder && hasActiveVerifiedOrder && (
        <Card className="p-8 bg-white shadow-2xl border-0 mt-8">
          <div className="text-center mb-8"><h2 className="text-3xl font-bold text-blue-900 mb-2">Detalles del Pedido</h2><p className="text-4xl font-bold text-green-700 tracking-wider">{verifiedOrder.order_number}</p></div>
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="p-6 bg-white rounded-2xl shadow-lg border-4 border-green-600 flex flex-col items-center justify-center gap-3">
                <QRCodeSVG value={getOrderVerificationUrl(verifiedOrder.pickup_code ?? verifiedOrder.order_number)} size={180} includeMargin level="M" />
                <span className="text-xs font-mono font-bold text-gray-700 tracking-wider">{verifiedOrder.pickup_code ?? verifiedOrder.order_number}</span>
              </div>
              <p className="max-w-xs text-center text-xs text-gray-500">Este QR es el mismo que debe presentar el estudiante. Al escanearlo se abre la verificación pública del pedido.</p>
            </div>
            <div className="space-y-4">
              <div><p className="text-sm text-gray-600 mb-1">Estado del Pedido</p>{getStatusBadge(verifiedOrder.status)}</div>
              <div><p className="text-sm text-gray-600 mb-1">Estado del Pago</p><Badge className={verifiedOrder.payment_status === 'confirmed' ? 'bg-green-600 text-white' : verifiedOrder.payment_status === 'pending' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}>{verifiedOrder.payment_status === 'confirmed' ? 'Pago Confirmado' : verifiedOrder.payment_status === 'pending' ? 'Pago Pendiente' : 'Pago Rechazado'}</Badge></div>
              <div><p className="text-sm text-gray-600 mb-1">Total del Pedido</p><p className="text-3xl font-bold text-blue-900">${verifiedOrder.total.toLocaleString()}</p></div>
              <div><p className="text-sm text-gray-600 mb-1">Fecha y Hora</p><p className="font-medium text-gray-900">{format(new Date(verifiedOrder.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p></div>
              <div><p className="text-sm text-gray-600 mb-1">Método de Pago</p><p className="font-medium text-gray-900 capitalize">{verifiedOrder.payment_method === 'cash' ? 'Efectivo' : verifiedOrder.payment_method}</p></div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 mb-6"><h3 className="font-bold text-lg text-blue-900 mb-4">Artículos del Pedido</h3><div className="space-y-3">{verifiedOrder.order_items?.map((item) => <div key={item.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"><div className="flex items-center gap-3"><span className="w-10 h-10 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">{item.quantity}</span><span className="font-medium text-gray-900">{item.product?.name}</span></div><span className="font-bold text-blue-900">${(item.price * item.quantity).toLocaleString()}</span></div>)}</div></div>

          {verifiedOrder.status !== 'delivered' && verifiedOrder.status !== 'cancelled' && <div className="border-t border-gray-200 pt-6"><Button onClick={handleMarkAsDelivered} className="h-14 w-full bg-blue-600 text-lg font-bold text-white shadow-sm hover:bg-blue-700"><CheckCircle className="w-6 h-6 mr-3"/>Marcar como Entregado</Button></div>}
          {verifiedOrder.status === 'delivered' && <div className="border-t border-gray-200 pt-6"><div className="flex items-center justify-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg"><CheckCircle className="w-6 h-6 text-green-600"/><span className="text-green-800 font-medium text-lg">Este pedido ya fue entregado</span></div></div>}
        </Card>
      )}
    </div>
  );
}
