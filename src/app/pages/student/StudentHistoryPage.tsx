import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Minus, Plus, RefreshCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type Order } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';

const money = (n: number) => n.toLocaleString('es-CO');
type CancellationTarget = { orderId: string; itemId: string; productName: string; quantity: number; requestedQuantity: number };
type CancellationStatus = 'pending' | 'approved' | 'rejected';

export function StudentHistoryPage() {
  const navigate = useNavigate();
  const { orders, loadData } = useDataStore();
  const [userId, setUserId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<CancellationTarget | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [itemRequestStatus, setItemRequestStatus] = useState<Record<string, CancellationStatus>>({});

  const refresh = useCallback(async () => { await loadData(); }, [loadData]);
  const loadCancellationStatuses = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await requireSupabaseClient().from('order_cancellation_requests').select('order_item_id,status,created_at').eq('user_id', userId).not('order_item_id', 'is', null).order('created_at', { ascending: false });
    if (error) return;
    const next: Record<string, CancellationStatus> = {};
    for (const row of data ?? []) if (row.order_item_id && !next[row.order_item_id]) next[row.order_item_id] = row.status as CancellationStatus;
    setItemRequestStatus(next);
  }, [userId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const client = requireSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      const id = data.session?.user.id;
      if (!id) { navigate('/'); return; }
      if (active) setUserId(id);
      await refresh();
    })().catch(() => navigate('/'));
    return () => { active = false; };
  }, [navigate, refresh]);

  useEffect(() => { if (userId) void loadCancellationStatuses(); }, [userId, loadCancellationStatuses, orders.length]);

  const mine = userId ? orders.filter((order) => order.user_id === userId) : [];
  const reorder = (order: Order) => {
    const items = (order.order_items ?? []).filter((item) => item.product_id && item.quantity > 0).map((item) => `${item.product_id}:${item.quantity}`).join(',');
    if (items) navigate(`/menu?reorder=${encodeURIComponent(items)}`);
  };

  const requestProductCancellation = async () => {
    if (!cancelling || reason.trim().length < 3) { toast.error('Escribe un motivo de al menos 3 caracteres.'); return; }
    setBusy(true);
    try {
      const { error } = await requireSupabaseClient().rpc('request_order_item_cancellation', {
        p_order_item_id: cancelling.itemId,
        p_reason: reason.trim(),
        p_requested_quantity: cancelling.requestedQuantity,
      });
      if (error) throw error;
      toast.success(`Solicitud enviada para ${cancelling.productName} (${cancelling.requestedQuantity}).`);
      setItemRequestStatus((current) => ({ ...current, [cancelling.itemId]: 'pending' }));
      setCancelling(null);
      setReason('');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo solicitar la cancelación del producto.');
    } finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),#f5f8f7] p-5 sm:p-8 text-slate-900">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl">
        <Link to="/student/features" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4"/>Funciones</Link>
        <div className="mt-4 flex items-center gap-3"><History className="h-7 w-7 text-emerald-700"/><div><h1 className="text-3xl font-black">Historial de pedidos</h1><p className="text-sm text-slate-600">Tus compras, estados, recompras y cancelaciones por producto.</p></div></div>
      </header>

      {mine.length === 0 ? <div className="rounded-3xl border border-white/60 bg-white/70 p-8 text-center shadow-sm backdrop-blur-xl"><p className="font-black">Aún no tienes pedidos.</p><Link to="/menu" className="mt-4 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Ir al menú</Link></div> : mine.map((order: Order) => {
        const items = order.order_items ?? [];
        const cancellable = order.status === 'pending' || order.status === 'preparing';
        return <article key={order.id} className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">#{order.order_number}</p><h2 className="font-black capitalize">{order.status === 'pending' ? 'Pendiente' : order.status === 'preparing' ? 'En preparación' : order.status === 'ready' ? 'Listo' : order.status === 'delivered' ? 'Entregado' : order.status === 'cancelled' ? 'Cancelado' : 'Rechazado'}</h2><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString('es-CO')}</p></div><p className="text-lg font-black text-emerald-800">${money(Number(order.total))}</p></div>
          {items.length > 0 && <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Productos</p><div className="space-y-3">{items.map((item) => {
            const requestStatus = itemRequestStatus[item.id];
            return <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">{item.quantity} × {item.product?.name ?? 'Producto'}</p><p className="text-sm font-bold text-slate-600">${money(Number(item.price) * item.quantity)}</p></div>{requestStatus === 'pending' ? <span className="rounded-full bg-amber-100 px-3 py-1 text-center text-xs font-black text-amber-800">Cancelación pendiente</span> : cancellable ? <button type="button" onClick={() => { setCancelling({ orderId: order.id, itemId: item.id, productName: item.product?.name ?? 'Producto', quantity: item.quantity, requestedQuantity: item.quantity }); setReason(''); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50"><X className="h-4 w-4"/>Solicitar cancelación</button> : null}</div></div>;
          })}</div></div>}
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Pago</span><p className="font-bold">{order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</p></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Método</span><p className="font-bold">{order.payment_method === 'bre-b' ? 'Bre-B' : order.payment_method === 'cash' ? 'Efectivo' : order.payment_method === 'credits' ? 'Saldo QuickBite' : 'Transferencia'}</p></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Recogida</span><p className="font-bold">{order.pickup_code ?? 'Pendiente'}</p></div></div>
          <div className="mt-4"><button type="button" onClick={() => reorder(order)} disabled={items.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCcw className="h-4 w-4"/>Recomprar este pedido</button></div>
        </article>;
      })}

      {cancelling && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-black uppercase tracking-wide text-red-700">Solicitud de cancelación de producto</p><h2 className="mt-1 text-xl font-black">{cancelling.productName}</h2><p className="mt-1 text-sm text-slate-600">Tienes {cancelling.quantity} unidad(es). Selecciona cuántas quieres cancelar.</p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="text-sm font-bold text-slate-700">Cantidad a cancelar</span><div className="flex items-center gap-3"><button type="button" aria-label="Reducir cantidad" onClick={() => setCancelling((current) => current ? { ...current, requestedQuantity: Math.max(1, current.requestedQuantity - 1) } : current)} disabled={cancelling.requestedQuantity <= 1} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-40"><Minus className="h-4 w-4"/></button><span className="min-w-8 text-center text-lg font-black">{cancelling.requestedQuantity}</span><button type="button" aria-label="Aumentar cantidad" onClick={() => setCancelling((current) => current ? { ...current, requestedQuantity: Math.min(current.quantity, current.requestedQuantity + 1) } : current)} disabled={cancelling.requestedQuantity >= cancelling.quantity} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-40"><Plus className="h-4 w-4"/></button></div></div>
        <p className="mt-2 text-xs text-slate-500">Puedes cancelar desde 1 hasta {cancelling.quantity} unidad(es). El reembolso se calcula solo sobre la cantidad aprobada.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={4} placeholder="Indica el motivo..." className="mt-4 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"/><div className="mt-4 flex gap-2"><button type="button" onClick={() => { setCancelling(null); setReason(''); }} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">Cerrar</button><button type="button" disabled={busy} onClick={() => void requestProductCancellation()} className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'Enviando...' : `Solicitar ${cancelling.requestedQuantity}`}</button></div></div></div>}
    </div>
  </div>;
}
