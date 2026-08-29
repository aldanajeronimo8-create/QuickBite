import { useMemo, useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { requireSupabaseClient } from '../../../lib/supabase';
import type { SalesRedemptionExport } from '../../../services/orderExportService';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CheckCircle, XCircle, Clock, CreditCard, Download, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { downloadActiveSalesExcel } from '../../../services/orderExportService';

const fmt = (value: number) => value.toLocaleString('es-CO');

type RedemptionQueryRow = SalesRedemptionExport;

export function AdminPayments() {
  const { orders, moderateOrderPayment, archiveOrders } = useDataStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeOrders = useMemo(() => orders.filter((order) => !order.admin_hidden), [orders]);
  const filteredOrders = useMemo(() => {
    let filtered = activeOrders.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (filterStatus !== 'all') filtered = filtered.filter((o) => o.payment_status === filterStatus);
    return filtered;
  }, [activeOrders, filterStatus]);

  const exportableOrders = useMemo(() => activeOrders.filter((order) => order.payment_status !== 'pending'), [activeOrders]);
  const exportTotal = exportableOrders.filter((order) => order.payment_status === 'confirmed').reduce((sum, order) => sum + order.total, 0);
  const rejectedExportCount = exportableOrders.filter((order) => order.payment_status === 'rejected').length;

  const stats = useMemo(() => {
    const pending = activeOrders.filter((o) => o.payment_status === 'pending').length;
    const confirmed = activeOrders.filter((o) => o.payment_status === 'confirmed').length;
    const rejected = activeOrders.filter((o) => o.payment_status === 'rejected').length;
    const totalConfirmed = activeOrders.filter((o) => o.payment_status === 'confirmed').reduce((sum, o) => sum + o.total, 0);
    return { pending, confirmed, rejected, totalConfirmed };
  }, [activeOrders]);

  const handleConfirmPayment = async (orderId: string) => {
    try { await moderateOrderPayment(orderId, 'approve'); toast.success('Pago confirmado exitosamente'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo confirmar el pago'); }
  };

  const handleRejectPayment = async (orderId: string) => {
    try { await moderateOrderPayment(orderId, 'reject'); toast.success('Pago rechazado y pedido cancelado. El stock fue restaurado.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo rechazar el pago'); }
  };

  const exportSalesAndReset = async () => {
    if (exportableOrders.length === 0) { toast.info('No hay pagos cerrados para exportar.'); return; }
    setExporting(true);
    try {
      const { data, error } = await requireSupabaseClient()
        .from('loyalty_redemptions')
        .select('id,redemption_code,points_spent,status,created_at,reward:loyalty_rewards(title,product:products(name)),user:profiles!loyalty_redemptions_user_id_fkey(full_name,email)')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const redemptions = (data ?? []) as unknown as RedemptionQueryRow[];

      // Genera el libro XLSX estructurado (Resumen, Ventas, Detalle de productos y Canjes).
      // Las cantidades/pedidos/unidades/puntos se exportan como números; solo los precios usan moneda.
      const result = downloadActiveSalesExcel(exportableOrders, redemptions);
      if (!result.fileName || result.count !== exportableOrders.length) throw new Error('No se pudo generar el archivo completo de ventas.');

      const archivedCount = await archiveOrders(exportableOrders.map((order) => order.id));
      if (archivedCount !== exportableOrders.length) throw new Error('No se pudieron retirar todos los pagos exportados.');
      setShowExportConfirm(false);
      toast.success(`${exportableOrders.length} pago(s) (${rejectedExportCount} rechazado(s)) y ${redemptions.length} canje(s) exportados y retirados de Gestión de pagos.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la exportación. No se reinició Gestión de pagos.');
    } finally { setExporting(false); }
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
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><h1 className="mb-2 text-4xl font-bold text-blue-900">Gestión de pagos</h1><p className="text-lg text-gray-600">Confirma, rechaza y cierra el período de ventas.</p></div>
        <Button disabled={exportableOrders.length === 0 || exporting} onClick={() => setShowExportConfirm(true)} className="bg-green-600 text-white hover:bg-green-700"><FileSpreadsheet className="mr-2 h-4 w-4" /> Descargar Excel y reiniciar</Button>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><Clock className="h-8 w-8 text-amber-500" /><span className="text-3xl font-bold text-slate-900">{stats.pending}</span></div><p className="text-sm font-medium text-slate-500">Pagos pendientes</p></Card>
        <Card className="border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><CheckCircle className="h-8 w-8 text-green-600" /><span className="text-3xl font-bold text-slate-900">{stats.confirmed}</span></div><p className="text-sm font-medium text-slate-500">Pagos confirmados</p></Card>
        <Card className="border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><XCircle className="h-8 w-8 text-red-600" /><span className="text-3xl font-bold text-slate-900">{stats.rejected}</span></div><p className="text-sm font-medium text-slate-500">Pagos rechazados</p></Card>
        <Card className="border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><CreditCard className="h-8 w-8 text-blue-600" /><span className="text-2xl font-bold text-slate-900">${fmt(stats.totalConfirmed)}</span></div><p className="text-sm font-medium text-slate-500">Total confirmado</p></Card>
      </div>
      <Card className="mb-6 border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center"><label className="font-medium text-gray-700">Filtrar por estado:</label><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los pagos</SelectItem><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="confirmed">Confirmados</SelectItem><SelectItem value="rejected">Rechazados</SelectItem></SelectContent></Select><div className="md:ml-auto"><span className="text-sm text-gray-600">Total: <span className="font-bold text-blue-900">{filteredOrders.length}</span> pago(s)</span></div></div></Card>
      {filteredOrders.length === 0 ? <Card className="border border-slate-200 bg-white p-12 text-center shadow-sm"><CreditCard className="mx-auto mb-4 h-16 w-16 text-gray-300" /><p className="text-lg text-gray-500">No hay pagos para mostrar</p></Card> : <div className="space-y-4">{filteredOrders.map((order) => <Card key={order.id} className="border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-3"><h3 className="text-2xl font-bold text-green-700">{order.order_number}</h3>{getPaymentStatusBadge(order.payment_status)}</div><p className="mb-2 text-sm text-gray-600">{format(new Date(order.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}</p><div className="flex items-center gap-4 text-sm"><div><span className="text-gray-600">Método: </span><span className="font-medium capitalize">{order.payment_method === 'cash' ? 'Efectivo' : order.payment_method}</span></div><div><span className="text-gray-600">Artículos: </span><span className="font-medium">{order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0}</span></div></div></div><div className="text-right"><p className="mb-1 text-sm text-gray-600">Total</p><p className="mb-3 text-3xl font-bold text-blue-900">${fmt(order.total)}</p>{order.payment_status === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => handleConfirmPayment(order.id)} className="bg-green-600 text-white hover:bg-green-700"><CheckCircle className="mr-2 h-4 w-4" />Confirmar</Button><Button size="sm" variant="destructive" onClick={() => handleRejectPayment(order.id)}><XCircle className="mr-2 h-4 w-4" />Rechazar</Button></div>}</div></div><div className="mt-4 border-t border-gray-200 pt-4"><p className="mb-2 text-sm font-medium text-gray-700">Resumen del pedido:</p><div className="flex flex-wrap gap-2">{order.order_items?.map((item) => <Badge key={item.id} variant="outline" className="bg-gray-50">{item.quantity}x {item.product?.name ?? 'Producto'}</Badge>)}</div>{order.notes && <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-800">Comentario del estudiante</p><p className="mt-1 text-sm text-slate-700">{order.notes}</p></div>}</div></Card>)}</div>}
      {showExportConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5" onClick={() => !exporting && setShowExportConfirm(false)}><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center gap-3"><div className="rounded-2xl bg-green-100 p-3 text-green-700"><Download className="h-6 w-6" /></div><div><h2 className="text-xl font-black text-slate-900">Exportar ventas</h2><p className="text-sm text-slate-500">Cierre seguro del período actual</p></div></div><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><p className="font-semibold">¿Deseas exportar los pagos cerrados a Excel y retirarlos de Gestión de pagos?</p><p className="mt-3"><strong>{exportableOrders.length}</strong> pago(s) serán exportados y archivados.</p><p className="mt-1"><strong>{rejectedExportCount}</strong> rechazado(s) también se incluirán y desaparecerán de esta vista.</p><p className="mt-1"><strong>${fmt(exportTotal)}</strong> es el total confirmado del período.</p><p className="mt-3 text-xs leading-5 text-slate-500">Los pagos pendientes no se modifican. No se archivará nada si el archivo no puede generarse correctamente.</p></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={exporting} onClick={() => setShowExportConfirm(false)}>Cancelar</Button><Button disabled={exporting} onClick={exportSalesAndReset} className="bg-green-600 text-white hover:bg-green-700">{exporting ? 'Exportando...' : 'Sí, exportar y archivar'}</Button></div></div></div>}
    </div>
  );
}
