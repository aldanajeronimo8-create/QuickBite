import { useMemo, useState } from 'react';
import { CheckCircle, CreditCard, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { Order } from '../../../lib/supabase';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

export function AdminPaymentsFixed() {
  const { orders, updateOrder } = useDataStore();
  const [filterStatus, setFilterStatus] = useState('all');
  const [verificationOrder, setVerificationOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const activeOrders = useMemo(() => orders.filter((order) => !order.admin_hidden), [orders]);
  const filtered = useMemo(() => activeOrders.filter((order) => filterStatus === 'all' || order.payment_status === filterStatus).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime()), [activeOrders, filterStatus]);
  const stats = useMemo(() => ({ pending: activeOrders.filter(o=>o.payment_status==='pending').length, confirmed: activeOrders.filter(o=>o.payment_status==='confirmed').length, rejected: activeOrders.filter(o=>o.payment_status==='rejected').length, total: activeOrders.filter(o=>o.payment_status==='confirmed').reduce((s,o)=>s+Number(o.total),0)}), [activeOrders]);

  const verify = async (status: 'confirmed' | 'rejected') => {
    if (!verificationOrder || busy) return;
    setBusy(true);
    try { await updateOrder(verificationOrder.id, { payment_status: status }); toast.success(status === 'confirmed' ? 'Pago verificado y confirmado.' : 'Pago verificado y rechazado.'); setVerificationOrder(null); }
    catch (error) { toast.error(getErrorMessage(error, 'No se pudo actualizar el pago.')); }
    finally { setBusy(false); }
  };

  const paymentLabel = (method: string) => method === 'cash' ? 'Efectivo' : method === 'bre-b' ? 'Bre-B' : method;
  return <div className="space-y-6">
    <div><h1 className="text-4xl font-bold text-blue-900">Gestión de pagos</h1><p className="mt-2 text-lg text-slate-600">Verifica primero cada pago pendiente antes de confirmarlo o rechazarlo.</p></div>
    <div className="grid gap-4 md:grid-cols-4"><Card className="p-5"><Clock className="mb-2 h-7 w-7 text-amber-500" /><p className="text-3xl font-bold">{stats.pending}</p><p className="text-sm text-slate-500">Pendientes</p></Card><Card className="p-5"><CheckCircle className="mb-2 h-7 w-7 text-green-600" /><p className="text-3xl font-bold">{stats.confirmed}</p><p className="text-sm text-slate-500">Confirmados</p></Card><Card className="p-5"><XCircle className="mb-2 h-7 w-7 text-red-600" /><p className="text-3xl font-bold">{stats.rejected}</p><p className="text-sm text-slate-500">Rechazados</p></Card><Card className="p-5"><CreditCard className="mb-2 h-7 w-7 text-blue-600" /><p className="text-2xl font-bold">${stats.total.toLocaleString('es-CO')}</p><p className="text-sm text-slate-500">Total confirmado</p></Card></div>
    <Card className="p-5"><div className="flex flex-wrap items-center gap-3"><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los pagos</SelectItem><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="confirmed">Confirmados</SelectItem><SelectItem value="rejected">Rechazados</SelectItem></SelectContent></Select><span className="ml-auto text-sm text-slate-500">{filtered.length} pago(s)</span></div></Card>
    {filtered.length === 0 ? <Card className="p-12 text-center"><CreditCard className="mx-auto mb-4 h-12 w-12 text-slate-300" /><p className="text-slate-500">No hay pagos para mostrar.</p></Card> : <div className="space-y-4">{filtered.map(order => <Card key={order.id} className="p-5"><div className="flex flex-wrap justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3><Badge>{order.payment_status}</Badge></div><p className="mt-2 text-sm text-slate-600">{format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p><p className="mt-2 text-sm text-slate-700">Método: <strong>{paymentLabel(order.payment_method)}</strong> · Referencia: <strong>{order.payment_reference ?? 'Sin referencia'}</strong></p></div><div className="text-right"><p className="text-3xl font-bold text-blue-900">${Number(order.total).toLocaleString('es-CO')}</p>{order.payment_status === 'pending' && <Button className="mt-3 bg-blue-700 text-white" onClick={() => setVerificationOrder(order)}><ShieldCheck className="mr-2 h-4 w-4" />Verificar pago</Button>}</div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{order.order_items?.map(item => <Badge key={item.id} variant="outline">{item.quantity}× {item.product?.name ?? 'Producto'}</Badge>)}</div></Card>)}</div>}
    <Dialog open={!!verificationOrder} onOpenChange={(open)=>{ if(!open&&!busy) setVerificationOrder(null); }}><DialogContent><DialogHeader><DialogTitle>Verificación de pago</DialogTitle></DialogHeader>{verificationOrder && <div className="space-y-4"><div className="rounded-2xl bg-slate-50 p-4"><p><strong>Pedido:</strong> {verificationOrder.order_number}</p><p><strong>Total:</strong> ${Number(verificationOrder.total).toLocaleString('es-CO')}</p><p><strong>Método:</strong> {paymentLabel(verificationOrder.payment_method)}</p><p><strong>Referencia:</strong> {verificationOrder.payment_reference ?? 'Sin referencia'}</p></div><p className="text-sm text-slate-600">Revisa la evidencia del pago y confirma únicamente cuando corresponda.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setVerificationOrder(null)} disabled={busy}>Cancelar</Button><Button variant="destructive" onClick={()=>void verify('rejected')} disabled={busy}><XCircle className="mr-2 h-4 w-4" />Rechazar pago</Button><Button onClick={()=>void verify('confirmed')} disabled={busy} className="bg-green-600 text-white"><CheckCircle className="mr-2 h-4 w-4" />Confirmar pago</Button></div></div>}</DialogContent></Dialog>
  </div>;
}
