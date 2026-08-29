import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, ChevronRight, Heart, History, RefreshCw, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { getReorderItems, listFavorites, listNotifications, listOrderHistory, listPickupSlots, markNotificationRead, scheduleOrder, setFavorite } from '../../../services/platformFeatures';

type Product = { id: string; name: string; price: number; stock: number; available: boolean; image_url: string | null };
type FeatureHubProps = { userId: string };
type Notification = { id: string; title?: string; message?: string; read_at?: string | null };
type HistoryOrder = { id: string; order_number: string; created_at: string; total: number; status: string };
type PickupSlot = { id: string; name?: string; starts_at: string; ends_at?: string };

function nextPickupTimestamp(startsAt: string) {
  const now = new Date();
  const [hours, minutes, seconds = '0'] = startsAt.split(':');
  const target = new Date(now);
  target.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}

export function StudentFeatureHub({ userId }: FeatureHubProps) {
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const unread = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);

  async function refresh() {
    setLoading(true);
    try {
      const [favoriteRows, notificationRows, historyRows, slotRows] = await Promise.all([
        listFavorites(userId), listNotifications(userId), listOrderHistory(userId), listPickupSlots(),
      ]);
      const nextFavorites = (favoriteRows ?? []).flatMap((row: { product?: Product | Product[] | null }) => {
        const product = Array.isArray(row.product) ? row.product[0] : row.product;
        return product ? [product] : [];
      });
      setFavorites(nextFavorites);
      setNotifications(notificationRows ?? []);
      setHistory((historyRows ?? []) as HistoryOrder[]);
      setSlots(slotRows ?? []);
      if (!selectedOrder && historyRows?.[0]?.id) setSelectedOrder(historyRows[0].id);
      if (!selectedSlot && slotRows?.[0]?.id) setSelectedSlot(slotRows[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las funciones rápidas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) void refresh(); }, [open, userId]);

  async function toggleFavorite(product: Product) {
    const exists = favorites.some((item) => item.id === product.id);
    try {
      await setFavorite(userId, product.id, !exists);
      setFavorites((current) => exists ? current.filter((item) => item.id !== product.id) : [...current, product]);
      toast.success(exists ? 'Quitado de favoritos' : 'Añadido a favoritos');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar favoritos.');
    }
  }

  async function prepareReorder(orderId: string) {
    try {
      const items = await getReorderItems(orderId);
      if (!items.length) {
        toast.info('Los productos de ese pedido ya no están disponibles.');
        return;
      }
      const params = new URLSearchParams({ reorder: items.map((item) => `${item.product_id}:${item.quantity}`).join(',') });
      window.history.pushState({}, '', `/menu?${params.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      toast.success(`${items.length} producto(s) listos para volver a comprar.`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar la recompra.');
    }
  }

  async function markRead(notification: Notification) {
    if (notification.read_at) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo marcar la notificación.');
    }
  }

  async function scheduleSelectedOrder() {
    if (!selectedOrder || !selectedSlot) return;
    const slot = slots.find((item) => item.id === selectedSlot);
    if (!slot) return;
    try {
      await scheduleOrder(selectedOrder, selectedSlot, nextPickupTimestamp(slot.starts_at));
      toast.success('Pedido programado correctamente.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo programar el pedido.');
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full bg-green-700 px-4 py-3 text-sm font-black text-white shadow-xl ring-4 ring-white/80 transition hover:bg-green-800" aria-label="Abrir funciones de QuickBite"><Star className="h-4 w-4" /> Mi QuickBite {unread > 0 && <Badge className="bg-white text-green-800">{unread}</Badge>}</button>
    {open && <div className="fixed inset-0 z-40 bg-slate-950/40 p-4" onMouseDown={() => setOpen(false)}><section className="mx-auto mt-10 max-h-[85vh] max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-green-700">Centro del estudiante</p><h2 className="text-2xl font-black text-slate-950">Tus funciones rápidas</h2></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar"><RefreshCw className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-4 w-4" /></Button></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">Favoritos</h3><Heart className="h-5 w-5 text-pink-600" /></div>{favorites.length ? <div className="space-y-2">{favorites.map((product) => <div key={product.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="font-bold">{product.name}</p><p className="text-xs text-slate-500">${Number(product.price).toLocaleString('es-CO')} · Stock {product.stock}</p></div><Button size="sm" variant="outline" onClick={() => void toggleFavorite(product)}>Quitar</Button></div>)}</div> : <p className="text-sm text-slate-500">Todavía no tienes productos favoritos.</p>}</div>
        <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">Notificaciones</h3><Bell className="h-5 w-5 text-blue-700" /></div>{notifications.length ? <div className="space-y-2">{notifications.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => void markRead(item)} className={`block w-full rounded-xl p-3 text-left ${item.read_at ? 'bg-slate-50' : 'bg-green-50'}`}><p className="font-bold">{item.title ?? 'QuickBite'}</p><p className="text-sm text-slate-600">{item.message}</p>{!item.read_at && <span className="mt-1 block text-xs font-bold text-green-700">Marcar como leída</span>}</button>)}</div> : <p className="text-sm text-slate-500">No tienes notificaciones.</p>}</div>
        <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">Volver a comprar</h3><History className="h-5 w-5 text-green-700" /></div>{history.length ? <div className="space-y-2">{history.slice(0, 3).map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="font-bold">{order.order_number}</p><p className="text-xs text-slate-500">${Number(order.total).toLocaleString('es-CO')} · {order.status}</p></div><Button size="sm" onClick={() => void prepareReorder(order.id)}><ChevronRight className="mr-1 h-4 w-4" />Repetir</Button></div>)}</div> : <p className="text-sm text-slate-500">Tu historial aparecerá aquí.</p>}</div>
        <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">Programar recogida</h3><CalendarClock className="h-5 w-5 text-amber-600" /></div><select value={selectedOrder} onChange={(event) => setSelectedOrder(event.target.value)} className="mb-2 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"><option value="">Selecciona un pedido</option>{history.filter((order) => !['delivered', 'cancelled'].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select><select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"><option value="">Selecciona un recreo</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name ?? 'Recreo'} · {slot.starts_at.slice(0, 5)}</option>)}</select><Button className="w-full bg-green-700 text-white hover:bg-green-800" disabled={!selectedOrder || !selectedSlot || loading} onClick={() => void scheduleSelectedOrder()}>Programar pedido</Button></div>
      </div>
    </section></div>}
  </>;
}
