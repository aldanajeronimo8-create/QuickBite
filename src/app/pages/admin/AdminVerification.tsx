import { useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ScanLine, CheckCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function AdminVerification() {
  const { orders, updateOrder } = useDataStore();
  const [orderNumber, setOrderNumber] = useState('');
  const [verifiedOrder, setVerifiedOrder] = useState<any>(null);

  const handleSearch = () => {
    if (!orderNumber.trim()) {
      toast.error('Ingresa un número de orden');
      return;
    }

    const order = orders.find(
      (o) => o.order_number.toLowerCase() === orderNumber.toLowerCase().trim(),
    );

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
      pending: { label: 'Pendiente', className: 'bg-yellow-500 text-white' },
      preparing: { label: 'En Preparación', className: 'bg-blue-500 text-white' },
      ready: { label: 'Listo para Recoger', className: 'bg-green-500 text-white' },
      delivered: { label: 'Entregado', className: 'bg-gray-500 text-white' },
    };
    const statusConfig = config[status as keyof typeof config] || config.pending;
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-blue-900 mb-2">Verificación de Pedidos</h1>
        <p className="text-gray-600 text-lg">Escanea el código QR o ingresa el número de orden</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Search Section */}
        <Card className="p-6 bg-white shadow-lg border-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <ScanLine className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-blue-900">Buscar Pedido</h2>
              <p className="text-sm text-gray-600">Ingresa el número de orden</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="orderNumber">Número de Orden</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="orderNumber"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder="QB123456"
                  className="flex-1 text-lg font-mono"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Search className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
              <p className="text-sm text-blue-800">
                💡 <strong>Tip:</strong> En un entorno real, aquí podrías usar la cámara para
                escanear el código QR del pedido.
              </p>
            </div>
          </div>
        </Card>

        {/* Recent Orders */}
        <Card className="p-6 bg-white shadow-lg border-0">
          <h2 className="text-xl font-bold text-blue-900 mb-4">Pedidos Recientes</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orders
              .filter((o) => o.status !== 'delivered')
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 10)
              .map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    setOrderNumber(order.order_number);
                    setVerifiedOrder(order);
                  }}
                  className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-green-700">{order.order_number}</span>
                      <p className="text-xs text-gray-600">
                        {format(new Date(order.created_at), 'HH:mm', { locale: es })}
                      </p>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                </button>
              ))}
          </div>
        </Card>
      </div>

      {/* Order Details */}
      {verifiedOrder && (
        <Card className="p-8 bg-white shadow-2xl border-0 mt-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-blue-900 mb-2">Detalles del Pedido</h2>
            <p className="text-4xl font-bold text-green-700 tracking-wider">
              {verifiedOrder.order_number}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* QR Code */}
            <div className="flex justify-center">
              <div
                className="p-6 bg-white rounded-2xl shadow-lg border-4 border-green-600 flex flex-col items-center justify-center gap-3"
                style={{ width: 224, height: 224 }}
              >
                <svg
                  viewBox="0 0 80 80"
                  width="160"
                  height="160"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Top-left finder pattern */}
                  <rect
                    x="2"
                    y="2"
                    width="22"
                    height="22"
                    rx="2"
                    fill="none"
                    stroke="#111"
                    strokeWidth="3"
                  />
                  <rect x="8" y="8" width="10" height="10" rx="1" fill="#111" />
                  {/* Top-right finder pattern */}
                  <rect
                    x="56"
                    y="2"
                    width="22"
                    height="22"
                    rx="2"
                    fill="none"
                    stroke="#111"
                    strokeWidth="3"
                  />
                  <rect x="62" y="8" width="10" height="10" rx="1" fill="#111" />
                  {/* Bottom-left finder pattern */}
                  <rect
                    x="2"
                    y="56"
                    width="22"
                    height="22"
                    rx="2"
                    fill="none"
                    stroke="#111"
                    strokeWidth="3"
                  />
                  <rect x="8" y="62" width="10" height="10" rx="1" fill="#111" />
                  {/* Data modules */}
                  {[32, 36, 40, 44, 48].map((x) =>
                    [32, 36, 40, 44, 48].map((y) =>
                      Math.sin(x * y) > 0 ? (
                        <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#111" />
                      ) : null,
                    ),
                  )}
                  <rect x="32" y="32" width="3" height="3" fill="#111" />
                  <rect x="40" y="32" width="3" height="3" fill="#111" />
                  <rect x="36" y="36" width="3" height="3" fill="#111" />
                  <rect x="44" y="36" width="3" height="3" fill="#111" />
                  <rect x="32" y="44" width="3" height="3" fill="#111" />
                  <rect x="48" y="40" width="3" height="3" fill="#111" />
                  <rect x="40" y="48" width="3" height="3" fill="#111" />
                  <rect x="44" y="44" width="3" height="3" fill="#111" />
                </svg>
                <span className="text-xs font-mono font-bold text-gray-700 tracking-wider">
                  {verifiedOrder.order_number}
                </span>
              </div>
            </div>

            {/* Order Info */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Estado del Pedido</p>
                {getStatusBadge(verifiedOrder.status)}
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Estado del Pago</p>
                <Badge
                  className={
                    verifiedOrder.payment_status === 'confirmed'
                      ? 'bg-green-500 text-white'
                      : verifiedOrder.payment_status === 'pending'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-red-500 text-white'
                  }
                >
                  {verifiedOrder.payment_status === 'confirmed'
                    ? 'Pago Confirmado'
                    : verifiedOrder.payment_status === 'pending'
                      ? 'Pago Pendiente'
                      : 'Pago Rechazado'}
                </Badge>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Total del Pedido</p>
                <p className="text-3xl font-bold text-blue-900">
                  ${verifiedOrder.total.toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Fecha y Hora</p>
                <p className="font-medium text-gray-900">
                  {format(new Date(verifiedOrder.created_at), "d 'de' MMMM, yyyy - HH:mm", {
                    locale: es,
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Método de Pago</p>
                <p className="font-medium text-gray-900 capitalize">
                  {verifiedOrder.payment_method === 'cash'
                    ? 'Efectivo'
                    : verifiedOrder.payment_method}
                </p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="border-t border-gray-200 pt-6 mb-6">
            <h3 className="font-bold text-lg text-blue-900 mb-4">Artículos del Pedido</h3>
            <div className="space-y-3">
              {verifiedOrder.order_items?.map((item: any) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
                      {item.quantity}
                    </span>
                    <span className="font-medium text-gray-900">{item.product?.name}</span>
                  </div>
                  <span className="font-bold text-blue-900">
                    ${(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {verifiedOrder.status !== 'delivered' && (
            <div className="border-t border-gray-200 pt-6">
              <Button
                onClick={handleMarkAsDelivered}
                className="w-full h-14 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold text-lg shadow-lg"
              >
                <CheckCircle className="w-6 h-6 mr-3" />
                Marcar como Entregado
              </Button>
            </div>
          )}

          {verifiedOrder.status === 'delivered' && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span className="text-green-800 font-medium text-lg">
                  Este pedido ya fue entregado
                </span>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
