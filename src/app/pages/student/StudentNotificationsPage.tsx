import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell } from 'lucide-react';
import { requireSupabaseClient, type UserNotification } from '../../../lib/supabase';
import { listUserNotifications } from '../../../repositories/quickbiteRepository';

export function StudentNotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<UserNotification[]>([]);
  useEffect(() => {
    void (async () => {
      const client = requireSupabaseClient();
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id;
      if (!id) { navigate('/'); return; }
      setItems(await listUserNotifications(id));
    })();
  }, [navigate]);
  return <div className="min-h-screen bg-[#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-3xl space-y-5"><header className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><Link to="/student/features" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4"/>Funciones</Link><div className="mt-4 flex items-center gap-3"><Bell className="h-7 w-7 text-emerald-700"/><div><h1 className="text-3xl font-black">Notificaciones</h1><p className="text-sm text-slate-600">Avisos de pedidos y recompensas.</p></div></div></header>{items.length === 0 ? <div className="rounded-3xl bg-white/70 p-8 text-center shadow-sm backdrop-blur-xl">No tienes notificaciones.</div> : items.map((item) => <article key={item.id} className={`rounded-3xl border border-white/60 p-5 shadow-sm backdrop-blur-xl ${item.read_at ? 'bg-white/65' : 'bg-emerald-50/80'}`}><h2 className="font-black">{item.title}</h2><p className="mt-1 text-sm text-slate-600">{item.body}</p><p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('es-CO')}</p></article>)}</div></div>;
}
