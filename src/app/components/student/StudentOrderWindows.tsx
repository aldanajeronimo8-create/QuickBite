import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { requireSupabaseClient } from '@/lib/supabaseClient';

type OrderWindow = {
  slot_id: string;
  slot_name: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  max_orders: number;
  orders_count: number;
  accepting_orders: boolean;
};

const FRIENDLY_WINDOW_ERROR = 'No se pudo actualizar el estado de las ventanas. Intenta de nuevo.';

function timeLabel(value: string) {
  return value.slice(0, 5);
}

export default function StudentOrderWindows() {
  const [windows, setWindows] = useState<OrderWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const { data, error: rpcError } = await requireSupabaseClient().rpc('get_order_window_status');
      if (rpcError) throw rpcError;
      setWindows((data ?? []) as OrderWindow[]);
      setError(null);
    } catch {
      setError(FRIENDLY_WINDOW_ERROR);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const orderedWindows = useMemo(
    () => [...windows].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [windows],
  );

  return (
    <section aria-label="Ventanas disponibles" className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ventanas disponibles</h2>
          <p className="text-sm text-muted-foreground">Consulta cuándo puedes realizar tu pedido.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Actualizar ventanas"
        >
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Actualizar
        </button>
      </div>

      {error ? (
        <div role="status" className="mt-4 rounded-lg border p-3 text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando ventanas...</p>
      ) : orderedWindows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No hay ventanas de pedidos configuradas.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {orderedWindows.map((orderWindow) => {
            const remaining = Math.max(orderWindow.max_orders - orderWindow.orders_count, 0);
            return (
              <article key={orderWindow.slot_id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{orderWindow.slot_name}</h3>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      {timeLabel(orderWindow.starts_at)} – {timeLabel(orderWindow.ends_at)}
                    </p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
                    {orderWindow.accepting_orders
                      ? 'Puedes pedir'
                      : !orderWindow.enabled
                        ? 'Desactivada'
                        : remaining === 0
                          ? 'Cupo lleno'
                          : 'Pedidos cerrados'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {orderWindow.orders_count} de {orderWindow.max_orders} pedidos · {remaining} cupos restantes
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
