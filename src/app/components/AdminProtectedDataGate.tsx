import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { isVisualPreviewMode } from '../contexts/VisualThemeProvider';

export function AdminProtectedDataGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const loadData = useDataStore((state) => state.loadData);
  const preview = isVisualPreviewMode();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(async () => {
    if (preview || authLoading) return;
    if (!user) {
      setLoading(false);
      setError('La sesión administrativa no está disponible. Inicia sesión nuevamente.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron preparar los datos administrativos.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, loadData, preview, user]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  if (preview) return <>{children}</>;
  if (authLoading || loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center p-8">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Preparando sesión administrativa…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-lg font-black text-rose-800">No se pudieron preparar los datos</h2>
          <p className="mt-2 text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void prepare()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-rose-800 shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
