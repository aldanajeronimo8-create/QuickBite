import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, LogOut, RefreshCw, Utensils, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearStaffCoreSession, getStaffCoreSession, loadStaffCapabilities, loadStaffOrders, updateStaffOrderStatus, type CoreOrder } from '../../../lib/coreApi';

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  preparing: 'Preparando',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const nextStatus: Record<string, { status: 'preparing' | 'ready' | 'delivered'; label: string }> = {
  pending: { status: 'preparing', label: 'Iniciar preparación' },
  preparing: { status: 'ready', label: 'Marcar listo' },
  ready: { status: 'delivered', label: 'Confirmar entrega' },
};

export function StaffOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const session = getStaffCoreSession();
      if (!session) {
        navigate('/staff/login', { replace: true });
        return;
      }
      const capabilities = await loadStaffCapabilities();
      if (capabilities.role !== 'staff' || !capabilities.operations) {
        clearStaffCoreSession();
        navigate('/staff/login', { replace: true });
        return;
      }
      setOrders(await loadStaffOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar los pedidos.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const activeOrders = useMemo(() => orders.filter((order) => !['delivered', 'cancelled'].includes(order.status)), [orders]);

  async function advance(order: CoreOrder) {
    const transition = nextStatus[order.status];
    if (!transition) return;
    setBusyId(order.id);
    try {
      const updated = await updateStaffOrderStatus(order.id, transition.status);
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible actualizar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  function logout() {
    clearStaffCoreSession();
    navigate('/staff/login', { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">QuickBite Staff</p>
            <h1 className="text-2xl font-black">Centro de Operaciones</h1>
            <p className="text-sm text-slate-500">Pedidos activos: {activeOrders.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700 hover:bg-slate-50" aria-label="Actualizar pedidos"><RefreshCw className="h-5 w-5" /></button>
            <button type="button" onClick={logout} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700 hover:bg-slate-50" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {loading ? (
          <div className="grid min-h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : activeOrders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-3 text-lg font-black">No hay pedidos pendientes</h2><p className="mt-1 text-sm text-slate-500">La cola operativa está al día.</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOrders.map((order) => {
              const transition = nextStatus[order.status];
              return (
                <article key={order.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-400">Código de retiro</p>
                      <p className="mt-1 text-2xl font-black tracking-widest">{order.pickup_code}</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{statusLabels[order.status] ?? order.status}</span>
                  </div>
                  <div className="mt-5 space-y-2 text-sm text-slate-600">
                    <p className="flex items-center gap-2"><Utensils className="h-4 w-4" /> Total: <strong className="text-slate-950">${Number(order.total).toLocaleString('es-CO')}</strong></p>
                    <p className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> {new Date(order.created_at).toLocaleString('es-CO')}</p>
                    <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Pago: {order.payment_status}</p>
                  </div>
                  {transition && <button disabled={busyId === order.id} type="button" onClick={() => void advance(order)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 font-black text-white hover:bg-blue-500 disabled:opacity-60">{busyId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{transition.label}</button>}
                  {order.status === 'cancelled' && <XCircle className="mt-4 h-5 w-5 text-red-500" />}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
