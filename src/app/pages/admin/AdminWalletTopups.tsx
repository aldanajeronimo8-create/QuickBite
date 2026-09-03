import { useCallback, useEffect, useState } from 'react';
import { Wallet, Check, X, RefreshCw, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/authStore';

type RequestRow = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  reference: string | null;
  comment: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  full_name: string | null;
  email: string | null;
};

const money = (n: number) => Number(n).toLocaleString('es-CO');
const dateTime = (value: string) => new Date(value).toLocaleString('es-CO');

export function AdminWalletTopups() {
  const currentUser = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (!currentUser || authLoading) return;
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const { data, error: queryError } = await requireSupabaseClient().rpc('list_admin_wallet_topup_requests', { p_limit: 100 });
      if (queryError) throw queryError;
      setRequests((data ?? []) as RequestRow[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudieron cargar las recargas.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (authLoading || !currentUser) return undefined;
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    const client = requireSupabaseClient();
    const channel = client
      .channel('admin-wallet-topups-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_topup_requests' }, () => void load())
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [authLoading, currentUser?.id, load]);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const { error: rpcError } = await requireSupabaseClient().rpc('admin_approve_wallet_topup', { p_request_id: id });
      if (rpcError) throw rpcError;
      toast.success('Recarga aprobada y saldo actualizado.');
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? (/unauthorized|not_authorized/i.test(e.message) ? 'Tu sesión administrativa no tiene permisos para aprobar recargas.' : /request_not_found|already_reviewed/i.test(e.message) ? 'La solicitud ya fue procesada. Actualiza la lista.' : e.message) : 'No se pudo aprobar la recarga.');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? '';
    setBusy(id);
    try {
      const { error: rpcError } = await requireSupabaseClient().rpc('reject_wallet_topup', { p_request_id: id, p_reason: reason });
      if (rpcError) throw rpcError;
      toast.success('Recarga rechazada.');
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo rechazar la recarga.');
    } finally {
      setBusy(null);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <div className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Finanzas</p>
            <h1 className="text-3xl font-black">Recargas de billetera</h1>
            <p className="text-sm text-slate-600">Revisa quién solicitó la recarga, cuándo, cuánto, el método, referencia y comentario antes de aprobar o rechazar.</p>
          </div>
          <button onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-3 font-black shadow-sm disabled:cursor-not-allowed disabled:opacity-60" aria-label="Actualizar recargas">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </header>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Wallet className="h-6 w-6 text-emerald-700" />
            <div><p className="font-black">Pendientes</p><p className="text-sm text-slate-500">{pending.length} solicitudes por revisar</p></div>
          </div>
        </div>

        {error && !loading && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"><p className="font-black">No se pudieron cargar las solicitudes.</p><p className="mt-1">{error}</p><button onClick={() => void load(true)} className="mt-3 rounded-full bg-white px-4 py-2 font-black shadow-sm">Reintentar</button></div>}

        {loading ? <div className="rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500">Cargando solicitudes…</div> : requests.length === 0 ? <div className="rounded-3xl bg-white p-8 text-center">No hay solicitudes de recarga.</div> : <div className="space-y-3">
          {requests.map((r) => <article key={r.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-black">{r.full_name || 'Usuario sin nombre'}</p><p className="text-sm text-slate-500">{r.email || r.user_id}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{r.status}</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Fecha y hora</p><p className="text-sm font-bold">{dateTime(r.created_at)}</p></div>
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Método</p><p className="text-sm font-bold">{r.method || '—'}</p></div>
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Referencia</p><p className="break-all text-sm font-bold">{r.reference || '—'}</p></div>
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Cantidad</p><p className="text-lg font-black text-emerald-700">${money(Number(r.amount))}</p></div>
                </div>
                <div className="mt-4 flex gap-3 rounded-2xl bg-slate-50 p-4"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Comentario</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{r.comment || 'Sin comentario'}</p></div></div>
                {r.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy === r.id} onClick={() => void approve(r.id)} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Check className="h-4 w-4" />Aprobar</button><button disabled={busy === r.id} onClick={() => void reject(r.id)} className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><X className="h-4 w-4" />Rechazar</button></div>}
                {r.rejection_reason && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">Motivo: {r.rejection_reason}</p>}
              </div>
              <div className="lg:text-right"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Solicitud</p><p className="mt-1 break-all text-xs text-slate-500">{r.id}</p></div>
            </div>
          </article>)}
        </div>}
      </div>
    </div>
  );
}