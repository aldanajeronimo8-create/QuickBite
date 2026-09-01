import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell } from 'lucide-react';
import { requireSupabaseClient, type UserNotification } from '../../../lib/supabase';
import { listUserNotifications } from '../../../repositories/quickbiteRepository';

function getLocalDayKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function StudentNotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<UserNotification[]>([]);
  const todayKey = useMemo(() => getLocalDayKey(new Date()), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const client = requireSupabaseClient();
        const { data } = await client.auth.getSession();
        const id = data.session?.user.id;
        if (!id) {
          navigate('/');
          return;
        }
        const notifications = await listUserNotifications(id, 100);
        if (active) setItems(notifications);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const todayItems = useMemo(
    () => items.filter((item) => getLocalDayKey(item.created_at) === todayKey),
    [items, todayKey],
  );

  return (
    <div className="min-h-screen bg-[#f5f8f7] p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl">
          <Link to="/student/features" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
            <ArrowLeft className="h-4 w-4" />
            Funciones
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <Bell className="h-7 w-7 text-emerald-700" />
            <div>
              <h1 className="text-3xl font-black">Notificaciones</h1>
              <p className="text-sm text-slate-600">Avisos de hoy, incluidos los estados de tus recargas.</p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-sm font-bold text-slate-700">
            {todayItems.length === 1 ? '1 aviso de hoy' : `${todayItems.length} avisos de hoy`}
          </p>
          <p className="mt-1 text-xs text-slate-500">Este apartado se reinicia cada día para tu usuario.</p>
        </section>

        {todayItems.length === 0 ? (
          <div className="rounded-3xl bg-white/70 p-8 text-center shadow-sm backdrop-blur-xl">No tienes notificaciones hoy.</div>
        ) : (
          todayItems.map((item) => (
            <article
              key={item.id}
              className={`rounded-3xl border border-white/60 p-5 shadow-sm backdrop-blur-xl ${item.read_at ? 'bg-white/65' : 'bg-emerald-50/80'}`}
            >
              <h2 className="font-black">{item.title}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{item.body}</p>
              <p className="mt-2 text-xs text-slate-400">{formatNotificationDate(item.created_at)}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
