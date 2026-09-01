import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, History, PlusCircle, RefreshCw, Wallet, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type WalletRow = { balance: number };
type Transaction = { id: string; amount: number; balance_after: number; type: string; description: string | null; created_at: string };
type Topup = { id: string; amount: number; method: string; reference: string | null; comment: string | null; status: string; rejection_reason: string | null; created_at: string; reviewed_at: string | null };

const money = (value: number) => Number(value).toLocaleString('es-CO');
const dateTime = (value: string) => new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const methodLabel = (value: string) => ({ manual: 'Recarga manual', nequi: 'Nequi', 'bre-b': 'Bre-B' } as Record<string, string>)[value] ?? value;

function topupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/function .*request_wallet_topup.*does not exist|could not find the function/i.test(message)) {
    return 'El servicio de recargas no está disponible en este momento. Actualiza la página e inténtalo nuevamente.';
  }
  if (/duplicate|already exists|pending/i.test(message) && /topup|recarga/i.test(message)) {
    return 'Ya tienes una solicitud de recarga pendiente. Espera a que administración la revise.';
  }
  return message || 'No se pudo solicitar la recarga.';
}

export function StudentWalletPage() {
  const [wallet, setWallet] = useState<WalletRow>({ balance: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestingTopup, setRequestingTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState('manual');
  const [topupReference, setTopupReference] = useState('');
  const [topupComment, setTopupComment] = useState('');

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = session.session?.user.id;
    if (!userId) throw new Error('Sesión no disponible.');
    const [walletRes, txRes, topupRes] = await Promise.all([
      client.from('wallet_accounts').select('balance').eq('user_id', userId).maybeSingle(),
      client.from('wallet_transactions').select('id,amount,balance_after,type,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      client.from('wallet_topup_requests').select('id,amount,method,reference,comment,status,rejection_reason,created_at,reviewed_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    ]);
    for (const result of [walletRes, txRes, topupRes]) if (result.error) throw result.error;
    setWallet((walletRes.data as WalletRow | null) ?? { balance: 0 });
    setTransactions((txRes.data ?? []) as Transaction[]);
    setTopups((topupRes.data ?? []) as Topup[]);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudo cargar tu información de saldo.')).finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); toast.success('Saldo e historial actualizados.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo actualizar.'); }
    finally { setRefreshing(false); }
  };

  const requestTopup = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500000) {
      toast.error('Escribe un monto entre $1 y $500.000.');
      return;
    }
    const { data: session } = await requireSupabaseClient().auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) {
      toast.error('Tu sesión no está disponible. Inicia sesión nuevamente.');
      return;
    }
    setRequestingTopup(true);
    try {
      const client = requireSupabaseClient();
      const { error } = await client.rpc('request_wallet_topup', {
        p_amount: amount,
        p_method: topupMethod,
        p_reference: topupReference.trim() || null,
        p_user_id: userId,
        p_comment: topupComment.trim() || null,
      });
      if (error) throw error;
      setTopupAmount('');
      setTopupReference('');
      setTopupComment('');
      toast.success('Solicitud de recarga enviada. Quedará pendiente hasta ser confirmada por administración.');
      await load();
    } catch (error) {
      toast.error(topupErrorMessage(error));
    } finally {
      setRequestingTopup(false);
    }
  };

  const approvedTotal = useMemo(() => topups.filter((t) => t.status === 'approved').reduce((sum, t) => sum + Number(t.amount), 0), [topups]);
  const pendingTotal = useMemo(() => topups.filter((t) => t.status === 'pending').reduce((sum, t) => sum + Number(t.amount), 0), [topups]);
  const rejectedCount = topups.filter((t) => t.status === 'rejected').length;
  const lastApproved = topups.find((t) => t.status === 'approved');

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Cargando saldos y recargas…</div>;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.10),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Funciones</Link>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm font-bold shadow-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/>Actualizar</button>
      </header>

      <section className="overflow-hidden rounded-[2rem] bg-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">QuickBite Student</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Saldos y recargas</h1><p className="mt-2 max-w-xl text-sm text-slate-300">Consulta tu saldo, solicita una recarga y revisa todo el historial sin salir de esta sección.</p></div>
          <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10"><Wallet className="h-6 w-6 text-emerald-300"/><p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-300">Saldo disponible</p><p className="mt-1 text-4xl font-black">${money(Number(wallet.balance))}</p></div>
        </div>
        <a href="#solicitar-recarga" className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-black text-white hover:bg-emerald-400"><PlusCircle className="h-4 w-4"/>Solicitar una recarga</a>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Recargado aprobado</p><p className="mt-2 text-2xl font-black text-emerald-700">${money(approvedTotal)}</p><p className="mt-1 text-xs text-slate-500">En el historial mostrado</p></div>
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Pendiente</p><p className="mt-2 text-2xl font-black text-amber-600">${money(pendingTotal)}</p><p className="mt-1 text-xs text-slate-500">Esperando revisión</p></div>
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Rechazos</p><p className="mt-2 text-2xl font-black text-rose-600">{rejectedCount}</p><p className="mt-1 text-xs text-slate-500">Con motivo cuando fue indicado</p></div>
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Última aprobada</p><p className="mt-2 text-sm font-black text-slate-800">{lastApproved ? `$${money(Number(lastApproved.amount))}` : 'Sin recargas'}</p><p className="mt-1 text-xs text-slate-500">{lastApproved ? dateTime(lastApproved.reviewed_at ?? lastApproved.created_at) : '—'}</p></div>
      </section>

      <section id="solicitar-recarga" className="rounded-[2rem] border border-emerald-200 bg-white/90 p-6 shadow-xl backdrop-blur-xl sm:p-8">
        <div className="flex items-start gap-3"><PlusCircle className="mt-1 h-6 w-6 shrink-0 text-emerald-700"/><div><h2 className="text-xl font-black">Solicitar una recarga</h2><p className="mt-1 text-sm text-slate-500">Envía los datos del pago para que administración pueda revisar y aprobar la recarga. Tu saldo no cambia hasta la aprobación.</p></div></div>
        <form onSubmit={requestTopup} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">Monto<input type="number" min="1" max="500000" step="1" required value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} placeholder="Ej. 20000" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none ring-0 focus:border-emerald-500" /></label>
          <label className="text-sm font-bold text-slate-700">Método<select value={topupMethod} onChange={(event) => setTopupMethod(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none focus:border-emerald-500"><option value="manual">Recarga manual</option><option value="nequi">Nequi</option><option value="bre-b">Bre-B</option></select></label>
          <label className="text-sm font-bold text-slate-700">Referencia del pago <span className="font-normal text-slate-400">(opcional)</span><input value={topupReference} onChange={(event) => setTopupReference(event.target.value)} maxLength={120} placeholder="Número de referencia o comprobante" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none focus:border-emerald-500" /></label>
          <label className="text-sm font-bold text-slate-700">Comentario para administración <span className="font-normal text-slate-400">(opcional)</span><textarea value={topupComment} onChange={(event) => setTopupComment(event.target.value)} maxLength={500} rows={3} placeholder="Información adicional sobre tu recarga" className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none focus:border-emerald-500" /></label>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Monto máximo por solicitud: <b>$500.000</b>. La recarga queda pendiente hasta la revisión de administración.</p><button type="submit" disabled={requestingTopup} className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{requestingTopup ? 'Enviando…' : 'Enviar solicitud'}</button></div>
        </form>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3"><History className="h-6 w-6 text-blue-700"/><div><h2 className="text-xl font-black">Historial de recargas</h2><p className="text-sm text-slate-500">Cada solicitud conserva su hora, estado, referencia, comentario y respuesta de administración.</p></div></div>
        {topups.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Todavía no tienes solicitudes de recarga.</p> : <div className="mt-5 space-y-3">{topups.map((t) => <article key={t.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2">{t.status === 'approved' ? <CheckCircle2 className="h-5 w-5 text-emerald-600"/> : t.status === 'rejected' ? <XCircle className="h-5 w-5 text-rose-600"/> : <Clock3 className="h-5 w-5 text-amber-600"/>}<p className="font-black">${money(Number(t.amount))} · {methodLabel(t.method)}</p></div><p className="mt-1 text-xs text-slate-500">Solicitada: {dateTime(t.created_at)}{t.reviewed_at ? ` · Revisada: ${dateTime(t.reviewed_at)}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${t.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : t.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{t.status === 'approved' ? 'Aprobada' : t.status === 'rejected' ? 'Rechazada' : 'Pendiente'}</span></div>{t.reference && <p className="mt-3 text-sm"><b>Referencia:</b> {t.reference}</p>}{t.comment && <p className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700"><b>Tu comentario:</b> {t.comment}</p>}{t.rejection_reason && <p className="mt-2 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span><b>Motivo de rechazo:</b> {t.rejection_reason}</span></p>}{t.status === 'approved' && <p className="mt-2 text-xs font-bold text-emerald-700">La recarga fue aplicada a tu saldo.</p>}</article>)}</div>}
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3"><ArrowDownLeft className="h-6 w-6 text-emerald-700"/><div><h2 className="text-xl font-black">Movimientos de saldo</h2><p className="text-sm text-slate-500">Aquí puedes ver el saldo que quedó después de cada movimiento.</p></div></div>
        {transactions.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Todavía no hay movimientos registrados.</p> : <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100"><div className="hidden grid-cols-[1fr_auto_auto] gap-4 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-400 sm:grid"><span>Movimiento</span><span>Valor</span><span>Saldo restante</span></div>{transactions.map((tx) => { const positive = Number(tx.amount) >= 0; return <div key={tx.id} className="grid gap-2 border-t border-slate-100 bg-white px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"><div><p className="font-bold">{tx.description ?? tx.type}</p><p className="text-xs text-slate-500">{dateTime(tx.created_at)}</p></div><p className={`inline-flex items-center gap-1 font-black ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>{positive ? <ArrowDownLeft className="h-4 w-4"/> : <ArrowUpRight className="h-4 w-4"/>}{positive ? '+' : ''}${money(Number(tx.amount))}</p><p className="text-sm font-black text-slate-800">Saldo: ${money(Number(tx.balance_after))}</p></div>; })}</div>}
      </section>
    </div>
  </div>;
}
