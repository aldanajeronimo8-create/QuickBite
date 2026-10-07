import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, LogOut, PackageCheck, RefreshCw, Utensils } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { requireSupabaseClient, type StaffOrder } from '../../../lib/supabase';
import { listStaffActiveOrders, updateStaffOrderStatus } from '../../../repositories/quickbiteRepository';
import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';
import { Button } from '../../components/ui/button';

const nextStatus: Record<StaffOrder['status'], 'preparing' | 'ready' | 'delivered' | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
};

const statusMeta = {
  pending: { label: 'Pendiente', icon: Clock3 },
  preparing: { label: 'En preparación', icon: Utensils },
  ready: { label: 'Listo', icon: PackageCheck },
  delivered: { label: 'Entregado', icon: CheckCircle2 },
} as const;

export function StaffDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await listStaffActiveOrders();
      setOrders(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    const interval = window.setInterval(() => void loadOrders(true), 5000);
    const client = requireSupabaseClient();
    const channel = client
      .channel('quickbite-staff-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => void loadOrders(true))
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [loadOrders]);

  const grouped = useMemo(() => ({
    pending: orders.filter((order) => order.status === 'pending'),
    preparing: orders.filter((order) => order.status === 'preparing'),
    ready: orders.filter((order) => order.status === 'ready'),
  }), [orders]);

  const advance = async (order: StaffOrder) => {
    const status = nextStatus[order.status];
    if (!status) return;
    setUpdatingId(order.id);
    try {
      await updateStaffOrderStatus(order.id, status);
      toast.success('Pedido ' + order.order_number + ' actualizado.');
      await loadOrders(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el pedido.');
    } finally {
      setUpdatingId(null);
    }
  };

  const logout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (!user || user.role !== 'staff' || !user.active) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <QuickBiteLogo className="h-11 w-11 rounded-2xl" />
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-slate-500">QuickBite</p>
              <h1 className="text-xl font-black">Operación de cafetería</h1>
              <p className="text-sm text-slate-500">{user.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadOrders(true)} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
              Actualizar
            </Button>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((status) => {
            const meta = statusMeta[status];
            const Icon = meta.icon;
            return (
              <div key={status} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{meta.label}</p>
                    <p className="mt-2 text-3xl font-black">{grouped[status].length}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><Icon className="h-6 w-6" /></div>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Cola de pedidos</h2>
              <p className="text-sm text-slate-500">Los pedidos se actualizan automáticamente y avanzan en orden.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{orders.length} activos</span>
          </div>

          {loading ? (
            <div className="grid min-h-56 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-slate-500" /></div>
          ) : orders.length === 0 ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <div><CheckCircle2 className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-bold">No hay pedidos activos.</p><p className="mt-1 text-sm text-slate-500">La cola se actualizará cuando llegue un nuevo pedido.</p></div>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const meta = statusMeta[order.status];
                const action = nextStatus[order.status];
                return (
                  <article key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black">{order.order_number}</h3>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{meta.label}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{order.student_name}</p>
                        <p className="text-xs text-slate-500">{order.student_email || 'Sin correo visible'}</p>
                        <p className="mt-2 text-xs text-slate-500">{new Date(order.created_at).toLocaleString('es-CO')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</p>
                        <p className="text-xl font-black">{'$'}{Number(order.total).toLocaleString('es-CO')}</p>
                        <p className="mt-1 text-xs text-slate-500">Recogida: {order.pickup_code || '—'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
                          <span className="text-sm font-semibold">{item.quantity} × {item.product_name}</span>
                          <span className="text-xs font-bold text-slate-500">{'$'}{Number(item.price).toLocaleString('es-CO')}</span>
                        </div>
                      ))}
                    </div>

                    {order.student_comment && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                        <span className="font-black">Nota:</span> {order.student_comment}
                      </div>
                    )}

                    {action && (
                      <div className="mt-4 flex justify-end">
                        <Button onClick={() => void advance(order)} disabled={updatingId === order.id}>
                          {updatingId === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : action === 'preparing' ? <Utensils className="mr-2 h-4 w-4" /> : action === 'ready' ? <PackageCheck className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          {action === 'preparing' ? 'Comenzar preparación' : action === 'ready' ? 'Marcar como listo' : 'Marcar como entregado'}
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
