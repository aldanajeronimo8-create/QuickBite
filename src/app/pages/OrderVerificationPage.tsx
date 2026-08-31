import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, PackageCheck, XCircle } from 'lucide-react';
import { requireSupabaseClient } from '../../lib/supabase';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

interface VerifiedOrder {
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  pickup_code: string | null;
  estimated_minutes: number | null;
  items: Array<{ name: string; quantity: number }>;
}

const statusText: Record<string, string> = {
  pending: 'Recibido', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado',
  rejected: 'Rechazado', cancelled: 'Cancelado',
};

export function OrderVerificationPage() {
  const [order, setOrder] = useState<VerifiedOrder | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')?.trim();
    if (!code) { setError('Código de pedido no encontrado.'); return; }
    void (async () => {
      try {
        const client = requireSupabaseClient();
        const { data, error: rpcError } = await client.rpc('get_order_by_pickup_code', { p_pickup_code: code });
        if (rpcError) throw rpcError;
        setOrder(data as VerifiedOrder);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        setError(/order_qr_not_found/i.test(message) ? 'Código de pedido inválido o no encontrado.' : 'No se pudo verificar el pedido.');
      }
    })();
  }, []);

  const delivered = order?.status === 'delivered';
  const rejected = order?.status === 'rejected' || order?.status === 'cancelled';

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8"><div className="mx-auto max-w-lg space-y-5"><header className="flex items-center gap-3"><QuickBiteLogo className="h-12 w-12 rounded-2xl"/><div><p className="text-xs font-black uppercase tracking-[.2em] text-green-700">QuickBite</p><h1 className="text-2xl font-black text-slate-900">Verificación de pedido</h1></div></header>{error ? <section className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl"><XCircle className="mx-auto h-14 w-14 text-red-600"/><h2 className="mt-4 text-xl font-black">Código no válido</h2><p className="mt-2 text-sm text-slate-600">{error}</p></section> : !order ? <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"><Clock3 className="mx-auto h-10 w-10 animate-pulse text-slate-400"/><p className="mt-3 font-bold text-slate-600">Verificando pedido…</p></section> : <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">Pedido</p><p className="text-3xl font-black text-green-800">{order.order_number}</p></div><div className={`rounded-full px-3 py-1 text-xs font-black ${delivered ? 'bg-green-100 text-green-800' : rejected ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{statusText[order.status] ?? order.status}</div></div><div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3">{delivered ? <CheckCircle2 className="h-7 w-7 text-green-700"/> : rejected ? <XCircle className="h-7 w-7 text-red-600"/> : <PackageCheck className="h-7 w-7 text-amber-600"/>}<div><p className="font-black">{delivered ? 'Pedido ya entregado' : rejected ? 'Pedido no entregable' : 'Pedido válido'}</p><p className="text-xs text-slate-500">Pago: {order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</p></div></div></div><div className="mt-5 space-y-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Productos</p>{order.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm"><span>{item.quantity} × {item.name}</span><span className="font-bold">Cantidad</span></div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-green-50 p-4"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-black text-green-800">${Number(order.total).toLocaleString('es-CO')}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Código de recogida</p><p className="font-black tracking-[.2em]">{order.pickup_code ?? '—'}</p></div></div><p className="mt-4 text-xs text-slate-400">{new Date(order.created_at).toLocaleString('es-CO')}</p></section>}</div></main>;
}
