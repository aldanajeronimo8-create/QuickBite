import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, FileSpreadsheet, ShoppingBag, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { downloadAllSalesExcel, type SalesRedemptionExport } from '../../../services/orderExportService';
import { requireSupabaseClient } from '../../../lib/supabase';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { Order } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AdminRedemptionsSection } from './AdminRedemptionsSection';

const statusLabels: Record<Order['status'], { label: string; className: string }> = { pending: { label: 'Pedido recibido', className: 'bg-blue-600 text-white' }, preparing: { label: 'En preparación', className: 'bg-amber-500 text-white' }, ready: { label: 'Listo para recoger', className: 'bg-green-600 text-white' }, delivered: { label: 'Entregado', className: 'bg-green-800 text-white' }, rejected: { label: 'Rechazado', className: 'bg-red-600 text-white' }, cancelled: { label: 'Cancelado', className: 'bg-slate-500 text-white' } };
const paymentLabels: Record<Order['payment_status'], { label: string; className: string }> = { confirmed: { label: 'Confirmado', className: 'bg-green-100 text-green-800' }, pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' }, rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800' } };

type CancellationRow = {
  id: string;
  order_id: string;
  order_number: string;
  full_name: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  refund_amount: number;
  refund_method: string | null;
  review_note: string | null;
  created_at: string;
  order_item_id: string | null;
  product_name: string | null;
  requested_quantity: number | null;
};

function getOrderErrorMessage(error: unknown) { const message = getErrorMessage(error, 'No se pudo completar la operación con Supabase'); if (message.includes('admin_hidden') || message.includes('column')) return 'Falta aplicar la migración de visibilidad de pedidos en Supabase. Ejecuta la migración y vuelve a intentarlo.'; if (/not_authorized|row-level security|permission denied/i.test(message)) return 'Tu sesión no tiene permisos de administrador para actualizar pedidos.'; if (/delivered_order_immutable/i.test(message)) return 'El pedido ya fue entregado y su estado no se puede modificar.'; if (/rejected_order_immutable/i.test(message)) return 'El pedido ya fue rechazado y no se puede modificar.'; if (/invalid_order_transition/i.test(message)) return 'La transición de estado no es válida.'; return message; }
function getStatusBadge(status: Order['status']) { const c = statusLabels[status] ?? statusLabels.pending; return <Badge className={c.className}>{c.label}</Badge>; }
function getPaymentBadge(status: Order['payment_status']) { const c = paymentLabels[status] ?? paymentLabels.pending; return <Badge className={c.className}>Pago: {c.label}</Badge>; }
function getItemsCount(order: Order) { return order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0; }
function toDateTimeLocalValue(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function money(n: number) { return Number(n).toLocaleString('es-CO'); }

export function AdminOrders() {
  const { orders, loadData } = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportUntil, setExportUntil] = useState(() => toDateTimeLocalValue(new Date()));
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRow[]>([]);
  const [reviewingCancellationId, setReviewingCancellationId] = useState<string | null>(null);

  const loadCancellationRequests = async () => {
    const { data, error } = await requireSupabaseClient().rpc('admin_list_order_cancellation_requests');
    if (error) {
      toast.error(`No se pudieron cargar las solicitudes de cancelación: ${getErrorMessage(error, 'error desconocido')}`);
      return;
    }
    setCancellationRequests((data ?? []) as CancellationRow[]);
  };

  useEffect(() => { void loadCancellationRequests(); }, [orders.length]);

  const exportCutoffMs = useMemo(() => new Date(exportUntil).getTime(), [exportUntil]);
  const exportableOrders = useMemo(() => orders.filter((order) => Number.isFinite(exportCutoffMs) && new Date(order.created_at).getTime() <= exportCutoffMs), [orders, exportCutoffMs]);
  const exportTotal = useMemo(() => exportableOrders.filter((o) => o.payment_status === 'confirmed').reduce((s, o) => s + Number(o.total), 0), [exportableOrders]);
  const filteredOrders = useMemo(() => { let f = orders.filter((o) => o.payment_status === 'confirmed' || o.payment_status === 'rejected').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); if (filterStatus !== 'all') f = f.filter((o) => filterStatus === 'rejected' ? (o.status === 'rejected' || o.payment_status === 'rejected') : o.status === filterStatus); return f; }, [orders, filterStatus]);

  const pendingForOrder = (orderId: string) => cancellationRequests.filter((request) => request.order_id === orderId && request.status === 'pending');

  const handleStatusChange = async (id: string, status: Order['status']) => { if (updatingOrderId) return; setUpdatingOrderId(id); try { const { updateOrder: update } = useDataStore.getState(); await update(id, { status }); toast.success(status === 'rejected' ? 'Pedido rechazado y stock restaurado' : 'Estado del pedido actualizado'); if (selectedOrder?.id === id) setSelectedOrder({ ...selectedOrder, status, ...(status === 'rejected' ? { payment_status: 'rejected' } : {}) }); } catch (e) { toast.error(getOrderErrorMessage(e)); } finally { setUpdatingOrderId(null); } };

  const reviewCancellation = async (requestId: string, approve: boolean) => {
    if (reviewingCancellationId) return;
    setReviewingCancellationId(requestId);
    try {
      const { error } = await requireSupabaseClient().rpc('review_order_cancellation', {
        p_request_id: requestId,
        p_approve: approve,
        p_note: approve ? 'Revisado desde Gestión de pedidos.' : 'Solicitud rechazada tras revisión desde Gestión de pedidos.',
      });
      if (error) throw error;
      toast.success(approve ? 'Cancelación aprobada.' : 'Cancelación rechazada.');
      await loadData();
      await loadCancellationRequests();
      if (selectedOrder) {
        const refreshed = useDataStore.getState().orders.find((order) => order.id === selectedOrder.id);
        if (refreshed) setSelectedOrder(refreshed);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo revisar la solicitud de cancelación.'));
    } finally {
      setReviewingCancellationId(null);
    }
  };

  const handleExcelExport = async () => { if (!exportableOrders.length) { toast.info('No hay pedidos creados hasta el momento seleccionado.'); return; } setExporting(true); try { const cutoffIso = new Date(exportCutoffMs).toISOString(); const { data, error } = await requireSupabaseClient().from('loyalty_redemptions').select('id,redemption_code,points_spent,status,created_at,admin_hidden,reward:loyalty_rewards(title,product:products(name)),user:profiles!loyalty_redemptions_user_id_fkey(full_name,email)').eq('admin_hidden', false).lte('created_at', cutoffIso).order('created_at', { ascending: true }); if (error) throw error; const result = downloadAllSalesExcel(exportableOrders, (data ?? []) as unknown as SalesRedemptionExport[]); if (!result.fileName || result.count !== exportableOrders.length) throw new Error('No se pudo generar el archivo completo.'); setShowExportDialog(false); toast.success(`${result.count} pedido(s) exportados hasta ${format(new Date(exportCutoffMs), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}. El período operativo no fue reiniciado ni modificado.`); } catch (e) { toast.error(getOrderErrorMessage(e)); } finally { setExporting(false); } };

  return <div>
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="mb-2 text-4xl font-bold text-green-800">Gestión de pedidos</h1><p className="text-lg text-gray-600">Solo los pedidos aceptados o rechazados aparecen aquí. Los pendientes se revisan en Pagos.</p></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setShowExportDialog(true)} disabled={exporting || exportableOrders.length === 0} className="bg-green-700 text-white hover:bg-green-800"><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel</Button><Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => window.location.assign('/admin/reset')}>Reiniciar flujo</Button></div></div>
    <Card className="mb-6 border border-green-100 bg-green-50/60 p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto] md:items-end"><div><label htmlFor="orders-export-until" className="mb-2 block text-sm font-bold text-slate-700">Exportar pedidos hasta</label><input id="orders-export-until" type="datetime-local" value={exportUntil} onChange={(e) => setExportUntil(e.target.value)} className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" /><p className="mt-1 text-xs text-slate-600">Solo se incluirán pedidos creados hasta esa fecha y hora. Esta exportación no cierra ni reinicia el período operativo.</p></div><div><p className="text-sm font-semibold text-slate-700">Pedidos incluidos</p><p className="mt-1 text-2xl font-black text-slate-900">{exportableOrders.length}</p><p className="text-xs text-slate-500">Total confirmado: ${exportTotal.toLocaleString('es-CO')}</p></div><Button type="button" variant="outline" onClick={() => setExportUntil(toDateTimeLocalValue(new Date()))}>Usar ahora</Button></div></Card>
    <AdminRedemptionsSection />
    <Card className="mb-6 border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center gap-4"><label className="font-medium text-gray-700">Filtrar por estado:</label><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los pedidos</SelectItem><SelectItem value="preparing">En preparación</SelectItem><SelectItem value="ready">Listos</SelectItem><SelectItem value="delivered">Entregados</SelectItem><SelectItem value="rejected">Rechazados</SelectItem><SelectItem value="cancelled">Cancelados</SelectItem></SelectContent></Select><div className="ml-auto text-sm text-gray-600">Total: <span className="font-bold text-green-800">{filteredOrders.length}</span> pedido(s)</div></div></Card>
    {filteredOrders.length === 0 ? <Card className="border border-slate-200 bg-white p-12 text-center shadow-sm"><ShoppingBag className="mx-auto mb-4 h-16 w-16 text-gray-300" /><p className="text-lg text-gray-500">No hay pedidos para mostrar</p></Card> : <div className="space-y-4">{filteredOrders.map((order) => { const rejected = order.status === 'rejected' || order.payment_status === 'rejected'; const delivered = order.status === 'delivered'; const terminal = rejected || delivered; const pendingCancellationCount = pendingForOrder(order.id).length; return <Card key={order.id} className="border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-3"><h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3>{getStatusBadge(order.status)}{getPaymentBadge(order.payment_status)}{pendingCancellationCount > 0 && <Badge className="bg-red-100 text-red-800">{pendingCancellationCount} cancelación{pendingCancellationCount > 1 ? 'es' : ''} pendiente{pendingCancellationCount > 1 ? 's' : ''}</Badge>}</div><p className="mb-3 text-sm text-gray-600">{format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p><div className="flex items-center gap-2 text-sm text-gray-600"><span className="font-medium">Artículos:</span><span>{getItemsCount(order)} unidades</span></div></div><div className="text-right"><p className="mb-1 text-sm text-gray-600">Total</p><p className="mb-3 text-3xl font-bold text-green-800">${Number(order.total).toLocaleString()}</p><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)} className="border-green-600 text-green-700 hover:bg-green-50">Ver detalles</Button></div></div></div>{!terminal && order.payment_status === 'confirmed' && <div className="mt-4 border-t border-gray-200 pt-4"><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium text-gray-700">Acciones:</span><Button size="sm" variant="destructive" onClick={() => void handleStatusChange(order.id, 'rejected')} disabled={updatingOrderId === order.id}><XCircle className="mr-2 h-4 w-4" />Rechazar pedido</Button><span className="text-sm font-medium text-gray-700">Cambiar estado:</span>{(['preparing','ready','delivered'] as const).filter((s) => s !== order.status).map((s) => <Button key={s} size="sm" onClick={() => void handleStatusChange(order.id, s)} disabled={updatingOrderId === order.id} className={s === 'preparing' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-green-600 text-white hover:bg-green-700'}>{statusLabels[s].label}</Button>)}</div></div>}{pendingCancellationCount > 0 && <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-3"><div><p className="text-sm font-black text-red-900">Hay una solicitud de cancelación pendiente.</p><p className="text-xs text-red-700">Ábrela desde “Ver detalles” para aprobarla o rechazarla.</p></div><Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)} className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100">Revisar ahora</Button></div>}{terminal && <div className={`mt-4 rounded-2xl p-3 text-sm font-semibold ${rejected ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{rejected ? 'Pedido rechazado. No se puede modificar.' : 'Pedido entregado. Estado final, sin acciones adicionales.'}</div>}</Card>; })}</div>}

    <Dialog open={showExportDialog} onOpenChange={(open) => !exporting && setShowExportDialog(open)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Exportar a Excel</DialogTitle></DialogHeader><div className="space-y-4"><p className="font-semibold text-slate-900">Se exportarán únicamente los pedidos creados hasta la fecha y hora seleccionadas. Esta acción NO reinicia, elimina ni modifica el período operativo.</p><div className="rounded-2xl bg-green-50 p-4 text-sm text-slate-700"><p><strong>{exportableOrders.length}</strong> pedido(s) incluidos.</p><p className="mt-1">Total confirmado: <strong>${exportTotal.toLocaleString('es-CO')}</strong></p><p className="mt-1">Corte: <strong>{format(new Date(exportCutoffMs), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</strong></p></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={exporting} onClick={() => setShowExportDialog(false)}>Cancelar</Button><Button type="button" disabled={exporting} onClick={() => void handleExcelExport()} className="bg-green-700 text-white hover:bg-green-800">{exporting ? 'Exportando...' : 'Confirmar exportación'}</Button></div></div></DialogContent></Dialog>

    <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">Detalles del pedido</DialogTitle></DialogHeader>{selectedOrder && <div className="space-y-6"><div className="grid grid-cols-2 gap-4"><div><p className="text-sm text-gray-600">Número de orden</p><p className="text-xl font-bold text-green-700">{selectedOrder.order_number}</p></div><div><p className="text-sm text-gray-600">Total</p><p className="text-xl font-bold text-green-800">${Number(selectedOrder.total).toLocaleString()}</p></div><div><p className="text-sm text-gray-600">Estado</p>{getStatusBadge(selectedOrder.status)}</div><div><p className="text-sm text-gray-600">Método de pago</p><p className="font-medium capitalize">{selectedOrder.payment_method === 'cash' ? 'Efectivo' : selectedOrder.payment_method}</p></div></div>
      <div><h3 className="mb-3 text-lg font-bold text-green-800">Artículos del pedido</h3>{selectedOrder.order_items?.length ? <div className="space-y-2">{selectedOrder.order_items.map((item) => { const request = cancellationRequests.find((r) => r.order_item_id === item.id); return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"><div><p className="font-medium">{item.product?.name}</p><p className="text-sm text-gray-600">{item.quantity} × ${Number(item.price).toLocaleString()}</p>{request?.status === 'pending' && <p className="mt-1 text-xs font-bold text-red-700">Solicitud de cancelación pendiente · {request.requested_quantity ?? 1} unidad(es)</p>}</div><span className="font-bold text-green-800">${Number(item.price * item.quantity).toLocaleString()}</span></div>; })}</div> : <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Este pedido ya no tiene artículos activos.</p>}</div>
      {pendingForOrder(selectedOrder.id).length > 0 && <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><div className="mb-3"><p className="font-black text-red-900">Solicitudes de cancelación</p><p className="text-xs text-red-700">Puedes decidir aquí sin salir de Gestión de pedidos.</p></div><div className="space-y-3">{pendingForOrder(selectedOrder.id).map((request) => <div key={request.id} className="rounded-xl bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="font-black text-slate-900">{request.product_name ? `Producto: ${request.product_name}` : 'Pedido completo'}</p><p className="mt-1 text-sm text-slate-700">Cantidad solicitada: {request.requested_quantity ?? 1}</p><p className="mt-1 text-sm text-slate-700">Motivo: {request.reason}</p><p className="mt-1 text-xs text-slate-500">Solicitud: {format(new Date(request.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p><p className="mt-1 text-sm font-bold text-slate-700">Reembolso previsto: ${money(Number(request.refund_amount))}</p></div><div className="flex shrink-0 gap-2"><Button size="sm" disabled={reviewingCancellationId === request.id} onClick={() => void reviewCancellation(request.id, true)} className="bg-emerald-600 text-white hover:bg-emerald-700"><Check className="mr-2 h-4 w-4" />Aprobar</Button><Button size="sm" variant="outline" disabled={reviewingCancellationId === request.id} onClick={() => void reviewCancellation(request.id, false)} className="border-red-300 text-red-700 hover:bg-red-100"><X className="mr-2 h-4 w-4" />Rechazar</Button></div></div></div>)}</div></div>}
      {selectedOrder.notes && <div className="rounded-2xl bg-green-50 p-4"><p className="font-bold text-green-800">Comentario del estudiante</p><p className="mt-1 text-sm text-slate-700">{selectedOrder.notes}</p></div>}</div>}</DialogContent></Dialog>
  </div>;
}
