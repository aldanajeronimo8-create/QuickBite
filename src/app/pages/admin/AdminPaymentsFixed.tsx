import { useMemo, useState } from 'react';
import { CheckCircle, CreditCard, Eye, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import type { Order } from '../../../lib/supabase';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

export function AdminPaymentsFixed() {
  const { orders, updateOrder } = useDataStore();
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useMemo(() => orders.filter((o) => !o.admin_hidden && o.payment_status === 'pending'), [orders]);
  const confirmed = useMemo(() => orders.filter((o) => !o.admin_hidden && o.payment_status === 'confirmed'), [orders]);

  const verify = async (status: 'confirmed' | 'rejected') => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateOrder(selected.id, { payment_status: status });
      setSelected(null);
      toast.success(status === 'confirmed' ? 'Pago verificado y confirmado.' : 'Pago verificado y rechazado.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el pago.'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-7xl"><div className="mb-8"><h1 className="text-4xl font-bold text-blue-900">Gestión de pagos</h1><p className="mt-2 text-lg text-slate-600">Verifica cada pago antes de confirmar o rechazar el pedido.</p></div>
    <div className="mb-6 grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-sm text-slate-500">Pendientes de verificación</p><p className="mt-1 text-3xl font-black text-amber-600">{pending.length}</p></Card><Card className="p-5"><p className="text-sm text-slate-500">Confirmados</p><p className="mt-1 text-3xl font-black text-green-700">{confirmed.length}</p></Card><Card className="p-5"><p className="text-sm text-slate-500">Total confirmado</p><p className="mt-1 text-3xl font-black text-blue-900">${confirmed.reduce((sum, o) => sum + Number(o.total), 0).toLocaleString('es-CO')}</p></Card></div>
    <Card className="p-6"><div className="mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-bold text-blue-900">Pagos por verificar</h2></div>{pending.length === 0 ? <p className="py-8 text-center text-slate-500">No hay pagos pendientes.</p> : <div className="space-y-3">{pending.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"><div><p className="font-bold text-slate-900">{order.order_number}</p><p className="text-sm text-slate-500">{order.user?.full_name ?? 'Estudiante'} · {format(new Date(order.created_at), "d 'de' MMMM, HH:mm", { locale: es })}</p><p className="mt-1 text-lg font-black text-blue-900">${Number(order.total).toLocaleString('es-CO')}</p></div><Button onClick={() => setSelected(order)} className="bg-blue-700 text-white hover:bg-blue-800"><Eye className="mr-2 h-4 w-4" />Verificar pago</Button></div>)}</div>}</Card>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={() => !busy && setSelected(null)}><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div><h2 className="text-2xl font-black text-blue-900">Verificar pago</h2><p className="text-sm text-slate-500">Revisa la información antes de decidir.</p></div><Badge className="bg-amber-500 text-white">Pendiente</Badge></div><div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Pedido</p><p className="font-bold">{selected.order_number}</p></div><div><p className="text-xs text-slate-500">Estudiante</p><p className="font-bold">{selected.user?.full_name ?? 'Sin nombre'}</p></div><div><p className="text-xs text-slate-500">Método</p><p className="font-bold capitalize">{selected.payment_method === 'cash' ? 'Efectivo' : selected.payment_method}</p></div><div><p className="text-xs text-slate-500">Total</p><p className="font-black text-blue-900">${Number(selected.total).toLocaleString('es-CO')}</p></div><div className="sm:col-span-2"><p className="text-xs text-slate-500">Referencia de pago</p><p className="rounded-xl bg-slate-50 p-3 font-mono text-sm">{selected.payment_reference ?? 'Sin referencia'}</p></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void verify('rejected')}><XCircle className="mr-2 h-4 w-4" />Rechazar</Button><Button disabled={busy} onClick={() => void verify('confirmed')} className="bg-green-600 text-white hover:bg-green-700"><CheckCircle className="mr-2 h-4 w-4" />Confirmar pago</Button></div></div></div>}
  </div>;
}
