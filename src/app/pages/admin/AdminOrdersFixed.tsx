import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Download, Eye, EyeOff, Gift, ShoppingBag, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type Order } from '../../../lib/supabase';
import { downloadActiveSalesExcel } from '../../../services/orderExportService';
import { getErrorMessage } from '../../../lib/errorMessage';
import { useDataStore } from '../../../store/dataStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

type Redemption = { id: string; redemption_code: string | null; points_spent: number; status: string; created_at: string; user?: { full_name?: string | null; email?: string | null } | null; reward?: { title?: string | null; product?: { name?: string | null } | null } | null };
const statusLabels: Record<string, string> = { pending: 'Pedido recibido', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado', cancelled: 'Cancelado' };
const paymentLabels: Record<string, string> = { confirmed: 'Confirmado', pending: 'Pendiente', rejected: 'Rechazado' };

function OrderBadge({ status }: { status: string }) { return <Badge>{statusLabels[status] ?? status}</Badge>; }
function PaymentBadge({ status }: { status: string }) { return <Badge className="bg-slate-100 text-slate-800">Pago: {paymentLabels[status] ?? status}</Badge>; }

export function AdminOrdersFixed() {
  const { orders, updateOrder, resetOrdersForNewPeriod } = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [canjesOpen, setCanjesOpen] = useState(false);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ order: Order; status: Order['status'] } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await requireSupabaseClient().from('loyalty_redemptions').select('id,redemption_code,points_spent,status,created_at,user:profiles!loyalty_redemptions_user_id_fkey(full_name,email),reward:loyalty_rewards(title,product:products(name))').order('created_at', { ascending: false });
      if (!error && active) setRedemptions((data ?? []) as unknown as Redemption[]);
    })();
    return () => { active = false; };
  }, []);

  const filteredOrders = useMemo(() => orders.filter((order) => (showHidden ? order.admin_hidden : !order.admin_hidden)).filter((order) => filterStatus === 'all' || order.status === filterStatus).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [orders, filterStatus, showHidden]);
  const hiddenCount = useMemo(() => orders.filter((order) => order.admin_hidden).length, [orders]);
  const salesTotal = useMemo(() => orders.reduce((sum, order) => sum + Number(order.total || 0), 0), [orders]);

  const requestStatusChange = (order: Order, status: Order['status']) => {
    if (status === order.status) return;
    if (status !== 'pending' && order.payment_status !== 'confirmed') { toast.warning('Primero debes verificar y confirmar el pago.'); return; }
    setPendingStatusChange({ order, status });
  };

  const changeStatus = async () => {
    if (!pendingStatusChange) return;
    try { await updateOrder(pendingStatusChange.order.id, { status: pendingStatusChange.status }); toast.success('Estado del pedido actualizado'); setPendingStatusChange(null); }
    catch (error) { toast.error(getErrorMessage(error, 'No se pudo actualizar el pedido.')); }
  };

  const archive = async (order: Order) => {
    try { await updateOrder(order.id, { admin_hidden: !order.admin_hidden }); toast.success(order.admin_hidden ? 'Pedido restaurado' : 'Pedido archivado'); }
    catch (error) { toast.error(getErrorMessage(error, 'No se pudo actualizar el pedido.')); }
  };

  const exportAndReset = async () => {
    if (closingPeriod || !orders.length) return;
    setClosingPeriod(true);
    try {
      const result = downloadActiveSalesExcel(orders);
      const count = await resetOrdersForNewPeriod();
      setConfirmingExport(false); setSelectedOrder(null); setShowHidden(false);
      toast.success(`Excel descargado (${result.count} ventas) y ${count} pedidos reiniciados.`);
    } catch (error) { toast.error(getErrorMessage(error, 'No se pudo cerrar el período.')); }
    finally { setClosingPeriod(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-bold text-blue-900">Gestión de pedidos</h1><p className="mt-2 text-lg text-slate-600">Pedidos, canjes y cierre del período.</p></div><Button onClick={() => setConfirmingExport(true)} disabled={!orders.length || closingPeriod} className="bg-blue-700 text-white"><Download className="mr-2 h-4 w-4" />Exportar Excel y reiniciar</Button></div>

    <Card className="border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-3"><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los pedidos</SelectItem><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="preparing">En preparación</SelectItem><SelectItem value="ready">Listos</SelectItem><SelectItem value="delivered">Entregados</SelectItem><SelectItem value="cancelled">Cancelados</SelectItem></SelectContent></Select><Button type="button" variant="outline" onClick={() => setShowHidden((value) => !value)}>{showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{showHidden ? 'Ver activos' : `Ver archivados (${hiddenCount})`}</Button><span className="ml-auto text-sm text-slate-600">{filteredOrders.length} pedido(s)</span></div></Card>

    <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setCanjesOpen((value) => !value)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"><span className="flex items-center gap-3 font-bold text-blue-900"><Gift className="h-5 w-5" />Canjes</span>{canjesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>{canjesOpen && <div className="border-t border-slate-100 p-5">{redemptions.length === 0 ? <p className="text-sm text-slate-500">No hay canjes registrados.</p> : <div className="space-y-3">{redemptions.map((redemption) => <div key={redemption.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div><p className="font-bold text-slate-900">{redemption.redemption_code ?? redemption.id.slice(0, 8)}</p><p className="text-sm text-slate-600">{redemption.user?.full_name ?? 'Estudiante'} · {redemption.reward?.title ?? redemption.reward?.product?.name ?? 'Recompensa'}</p><p className="text-xs text-slate-500">{format(new Date(redemption.created_at), "d MMM yyyy HH:mm", { locale: es })}</p></div><div className="text-right"><Badge>{redemption.status}</Badge><p className="mt-1 text-xs font-semibold text-slate-600">{redemption.points_spent} puntos</p></div></div>)}</div>}</div>}</Card>

    {filteredOrders.length === 0 ? <Card className="border border-slate-200 bg-white p-12 text-center"><ShoppingBag className="mx-auto mb-4 h-14 w-14 text-slate-300" /><p className="text-lg text-slate-500">No hay pedidos para mostrar</p></Card> : <div className="space-y-4">{filteredOrders.map((order) => <Card key={order.id} className="border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3><OrderBadge status={order.status} /><PaymentBadge status={order.payment_status} />{order.admin_hidden && <Badge className="bg-slate-200 text-slate-700">Archivado</Badge>}</div><p className="text-sm text-slate-600">{format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p><p className="mt-2 text-sm text-slate-600">{order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0} unidades</p></div><div className="text-right"><p className="text-3xl font-bold text-blue-900">${Number(order.total).toLocaleString()}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>Ver detalles</Button><Button size="sm" variant="outline" onClick={() => void archive(order)}>{order.admin_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{order.admin_hidden ? 'Restaurar' : 'Archivar'}</Button></div></div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{(['pending','preparing','ready','delivered'] as const).map((status) => status !== order.status ? <Button key={status} size="sm" onClick={() => requestStatusChange(order, status)}>{statusLabels[status]}</Button> : null)}</div></Card>)}</div>}

    <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Detalles del pedido</DialogTitle></DialogHeader>{selectedOrder && <div className="space-y-4">{selectedOrder.order_items?.map((item) => <div key={item.id} className="flex justify-between rounded-xl bg-slate-50 p-3"><span>{item.quantity} × {item.product?.name}</span><strong>${Number(item.price * item.quantity).toLocaleString()}</strong></div>)}</div>}</DialogContent></Dialog>
    <Dialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}><DialogContent><DialogHeader><DialogTitle>Confirmar cambio de estado</DialogTitle></DialogHeader>{pendingStatusChange && <div className="space-y-4"><div className="rounded-xl bg-slate-50 p-4 text-sm"><p><strong>Pedido:</strong> {pendingStatusChange.order.order_number}</p><p><strong>Nuevo estado:</strong> {statusLabels[pendingStatusChange.status]}</p><p><strong>Pago:</strong> {paymentLabels[pendingStatusChange.order.payment_status]}</p></div><p className="text-sm text-slate-600">Confirma que quieres aplicar este cambio.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingStatusChange(null)}>Cancelar</Button><Button onClick={() => void changeStatus()} className="bg-blue-700 text-white"><ShieldCheck className="mr-2 h-4 w-4" />Confirmar</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={confirmingExport} onOpenChange={setConfirmingExport}><DialogContent><DialogHeader><DialogTitle>Exportar ventas y reiniciar</DialogTitle></DialogHeader><p className="text-sm text-slate-600">Se descargará el Excel y después se reiniciarán los pedidos del período.</p><div className="rounded-xl bg-slate-50 p-4 text-sm"><strong>{orders.length}</strong> pedidos · <strong>${salesTotal.toLocaleString('es-CO')}</strong> total</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmingExport(false)} disabled={closingPeriod}>Cancelar</Button><Button onClick={() => void exportAndReset()} disabled={closingPeriod}>Sí, exportar y reiniciar</Button></div></DialogContent></Dialog>
  </div>;
}
