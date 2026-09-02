import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { requireSupabaseClient } from '../../../lib/supabase';

type OrderWindow = {
  slot_id: string;
  slot_name: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  max_orders: number | null;
  orders_count: number;
  accepting_orders: boolean;
};

const timeLabel = (value: string) => value.slice(0, 5);

export function StudentOrderWindows() {
  const [windows, setWindows] = useState<OrderWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, error: rpcError } = await requireSupabaseClient().rpc('get_order_window_status');
      if (rpcError) throw rpcError;
      setWindows((data ?? []) as OrderWindow[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las ventanas de pedidos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const activeWindow = useMemo(() => windows.find((window) => window.accepting_orders), [windows]);

  return (
    <section className="mx-auto mt-4 max-w-6xl px-5 lg:px-8" aria-live="polite">
      <div className="rounded-[1.5rem] border border-emerald-100 bg-white p-4 shadow-sm ring-1 ring-emerald-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-slate-950">Ventanas disponibles</h2>
              <p className="text-xs text-slate-500">
                {activeWindow
                  ? `Puedes pedir ahora en ${activeWindow.slot_name}.`
                  : 'Los pedidos solo se pueden confirmar dentro de una ventana activa.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Actualizar ventanas de pedidos"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
            No se pudo actualizar el estado de las ventanas. {error}
          </div>
        )}

        {!error && !loading && windows.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            El administrador todavía no ha configurado ventanas de pedidos.
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {windows.map((window) => {
            const remaining = window.max_orders === null
              ? null
              : Math.max(0, window.max_orders - Number(window.orders_count ?? 0));
            const full = remaining === 0;
            const canOrder = window.accepting_orders && !full;

            return (
              <div
                key={window.slot_id}
                className={`rounded-2xl border p-3 ${
                  canOrder ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{window.slot_name}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">
                      {timeLabel(window.starts_at)}–{timeLabel(window.ends_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                      canOrder
                        ? 'bg-emerald-100 text-emerald-800'
                        : window.enabled && !full
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {canOrder ? 'Puedes pedir' : full ? 'Cupo lleno' : window.enabled ? 'Pedidos cerrados' : 'Desactivada'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {window.max_orders === null
                    ? `${Number(window.orders_count ?? 0)} pedidos registrados hoy · sin límite`
                    : `${Number(window.orders_count ?? 0)} pedidos hoy · ${remaining} disponibles de ${window.max_orders}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
