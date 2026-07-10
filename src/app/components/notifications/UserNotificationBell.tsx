import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Inbox, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { appConfig } from '../../../config/appConfig';
import { getErrorMessage } from '../../../lib/errorMessage';
import { requireSupabaseClient, type UserNotification } from '../../../lib/supabase';
import { listUserNotifications, markUserNotificationsRead } from '../../../repositories/quickbiteRepository';

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export function UserNotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const loadNotifications = useCallback(async () => {
    const items = await listUserNotifications(userId);
    setNotifications(items);
  }, [userId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await listUserNotifications(userId);
        if (active) setNotifications(items);
      } catch (error) {
        if (active) toast.error(getErrorMessage(error, 'No se pudieron cargar tus notificaciones.'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();

    if (!appConfig.supabaseRealtimeEnabled) {
      const pollingDelay = Math.max(appConfig.dataRefreshIntervalMs, 10_000);
      const interval = window.setInterval(() => void load(), pollingDelay);
      return () => {
        active = false;
        window.clearInterval(interval);
      };
    }

    const supabase = requireSupabaseClient();
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const incoming = payload.new as Partial<UserNotification>;
          if (payload.eventType === 'INSERT' && incoming.id && incoming.title && incoming.body) {
            const notification = incoming as UserNotification;
            setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
            toast.info(notification.title, { description: notification.body });
            return;
          }
          void load();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadIds = useMemo(
    () => notifications.filter((notification) => !notification.read_at).map((notification) => notification.id),
    [notifications],
  );

  const markRead = async (notificationIds?: string[]) => {
    const ids = notificationIds ?? unreadIds;
    if (ids.length === 0 || isMarkingRead) return;

    const readAt = new Date().toISOString();
    setIsMarkingRead(true);
    setNotifications((current) => current.map((item) => (ids.includes(item.id) ? { ...item, read_at: readAt } : item)));
    try {
      await markUserNotificationsRead(ids);
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudieron actualizar tus notificaciones.'));
      await loadNotifications();
    } finally {
      setIsMarkingRead(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative rounded-full bg-white/10 p-2 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-orange-300"
        aria-label={`Notificaciones${unreadIds.length ? `, ${unreadIds.length} sin leer` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadIds.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] font-black">
            {unreadIds.length > 9 ? '9+' : unreadIds.length}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-black">Notificaciones</h2>
              <p className="text-xs text-slate-500">{unreadIds.length ? `${unreadIds.length} sin leer` : 'Todo al dia'}</p>
            </div>
            {unreadIds.length > 0 && (
              <button
                type="button"
                onClick={() => void markRead()}
                disabled={isMarkingRead}
                className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Marcar todas como leidas"
                title="Marcar todas como leidas"
              >
                <CheckCheck className="h-5 w-5" />
              </button>
            )}
          </header>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="grid min-h-32 place-items-center text-slate-500">
                <LoaderCircle className="h-5 w-5 animate-spin" aria-label="Cargando notificaciones" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="grid min-h-32 place-items-center gap-2 px-6 py-8 text-center text-sm text-slate-500">
                <Inbox className="h-7 w-7 text-slate-300" />
                <p>No tienes notificaciones aun.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (!notification.read_at) void markRead([notification.id]);
                  }}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                    notification.read_at ? 'bg-white' : 'bg-orange-50/70'
                  }`}
                >
                  <div className="flex gap-3">
                    {!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />}
                    <div className={notification.read_at ? 'pl-5' : ''}>
                      <p className="text-sm font-bold">{notification.title}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{notification.body}</p>
                      <p className="mt-1.5 text-xs text-slate-400">{formatNotificationTime(notification.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
