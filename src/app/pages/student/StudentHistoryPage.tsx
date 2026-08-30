import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, ArrowLeft } from 'lucide-react';
import { requireSupabaseClient, type Order } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';

const money = (n: number) => n.toLocaleString('es-CO');

export function StudentHistoryPage() {
  const navigate = useNavigate();
  const { orders, loadData } = useDataStore();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const client = requireSupabaseClient();
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id;
      if (!id) { navigate('/'); return; }
      if (active) setUserId(id);
      await loadData();
    })();
    return () => { active = false; };
  }, [loadData, navigate]);
  const mine = userId ? orders.filter((order) => order.user_id === userId) : [];
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),#f5f8f7] p-5 sm:p-8 text-slate-900"><div className="mx-auto max-w-3xl space-y-5"><header className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><Link to="/student/features" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4"/>Funciones</Link><div className="mt-4 flex items-center gap-3"><History className="h-7 w-7 text-emerald-700"/><div><h1 className="text-3xl font-black">Historial de pedidos</h1><p className="text-sm text-slate-600">Tus compras, estados y totales.</p></div></div></header>{mine.length === 0 ? <div className="rounded-3xl border border-white/60 bg-white/70 p-8 text-center shadow-sm backdrop-blur-xl"><p className="font-black">Aún no tienes pedidos.</p><Link to="/menu" className="mt-4 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Ir al menú</Link></div> : mine.map((order: Order) => <article key={order.id} className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">#{order.order_number}</p><h2 className="font-black capitalize">{order.status === 'pending' ? 'Pendiente' : order.status === 'preparing' ? 'En preparación' : order.status === 'ready' ? 'Listo' : order.status === 'delivered' ? 'Entregado' : 'Cancelado'}</h2><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString('es-CO')}</p></div><p className="text-lg font-black text-emerald-800">${money(Number(order.total))}</p></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Pago</span><p className="font-bold">{order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</p></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Método</span><p className="font-bold">{order.payment_method === 'bre-b' ? 'Bre-B' : order.payment_method === 'cash' ? 'Efectivo' : 'Nequi'}</p></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-500">Recogida</span><p className="font-bold">{order.pickup_code ?? 'Pendiente'}</p></div></div></article>)}</div></div>;
}
