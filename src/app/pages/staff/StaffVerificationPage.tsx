import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, LogOut, RefreshCw, Search, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearStaffCoreSession, getStaffCoreSession, loadStaffCapabilities, loadStaffOrders, updateStaffOrderStatus, type CoreOrder } from '../../../lib/coreApi';

export function StaffVerificationPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CoreOrder[]>([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (!getStaffCoreSession()) {
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
      setError(err instanceof Error ? err.message : 'No fue posible cargar la verificación.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const normalized = code.trim().toUpperCase();
  const match = useMemo(
    () => orders.find((order) => order.pickup_code?.toUpperCase() === normalized && order.status !== 'cancelled'),
    [orders, normalized],
  );

  async function deliver() {
    if (!match) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateStaffOrderStatus(match.id, 'delivered');
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible confirmar la entrega.');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearStaffCoreSession();
    navigate('/staff/login', { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">QuickBite Staff</p>
            <h1 className="text-2xl font-black">Verificación de entrega</h1>
            <p className="text-sm text-slate-500">Valida el código de retiro usando QuickBite Core.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Actualizar"><RefreshCw className="h-5 w-5" /></button>
            <button type="button" onClick={logout} className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><KeyRound className="h-5 w-5" /></span>
            <div><h2 className="font-black">Código de retiro</h2><p className="text-sm text-slate-500">Escribe el código entregado por el estudiante.</p></div>
          </div>
          <div className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. QB8F12A3" autoComplete="off" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {error && <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          {loading ? (
            <div className="grid place-items-center py-10"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
          ) : normalized && !match ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800"><XCircle className="h-5 w-5 shrink-0" />No se encontró un pedido activo con ese código.</div>
          ) : match ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Pedido encontrado</p><p className="mt-1 text-2xl font-black">{match.pickup_code}</p></div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{match.status}</span>
              </div>
              <p className="mt-4 text-sm text-slate-600">Total del pedido: <strong className="text-slate-950">${Number(match.total).toLocaleString('es-CO')}</strong></p>
              {match.status !== 'delivered' ? (
                <button type="button" onClick={() => void deliver()} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirmar entrega
                </button>
              ) : (
                <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Pedido ya entregado.</div>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Ingresa un código para buscar el pedido.</div>
          )}
        </div>
      </section>
    </main>
  );
}
