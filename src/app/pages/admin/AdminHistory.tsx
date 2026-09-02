import { useCallback, useEffect, useState } from 'react';
import { Check, History, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';

type AuditRow = { source: string; id: string; created_at: string; actor_id: string | null; action: string; module: string; operation: string; entity_type: string | null; entity_id: string | null; status: string; metadata: Record<string, unknown> };
type CancellationRow = { id: string; order_id: string; order_number: string; full_name: string; email: string; reason: string; status: 'pending'|'approved'|'rejected'; refund_amount: number; refund_method: string | null; review_note: string | null; created_at: string };

const money = (n: number) => Number(n).toLocaleString('es-CO');
const date = (s: string) => new Date(s).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export function AdminHistory() {
  const localHistory = useDataStore((state) => state.history);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const [{ data: auditData, error: auditError }, { data: cancelData, error: cancelError }] = await Promise.all([
        client.rpc('admin_list_audit_events', { p_limit: 300 }),
        client.rpc('admin_list_order_cancellation_requests'),
      ]);
      if (auditError) throw auditError;
      if (cancelError) throw cancelError;
      setAudits((auditData ?? []) as AuditRow[]);
      setCancellations((cancelData ?? []) as CancellationRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar la auditoría.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reviewCancellation = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const { error } = await requireSupabaseClient().rpc('review_order_cancellation', { p_request_id: id, p_approve: approve, p_note: approve ? 'Revisado desde el centro administrativo.' : 'Solicitud rechazada tras revisión administrativa.' });
      if (error) throw error;
      toast.success(approve ? 'Cancelación aprobada.' : 'Cancelación rechazada.');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo revisar la solicitud.'); }
    finally { setBusy(null); }
  };

  return <div className="space-y-7">
    <header className="rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-6 shadow-xl sm:p-8">
      <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">Trazabilidad</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-black text-slate-950"><History className="h-7 w-7 text-blue-700"/>Auditoría y cancelaciones</h1><p className="mt-2 text-sm text-slate-600">Registro remoto de operaciones, solicitudes de cancelación y decisiones administrativas.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Actualizar</button></div>
    </header>

    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Solicitudes de cancelación</h2><p className="text-sm text-slate-600">Las cancelaciones se revisan antes de cambiar el pedido y registrar el reembolso.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800">{cancellations.filter((r) => r.status === 'pending').length} pendientes</span></div>
      <div className="mt-4 space-y-3">
        {cancellations.length === 0 ? <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No hay solicitudes.</p> : cancellations.map((r) => <article key={r.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black text-slate-400">#{r.order_number} · {date(r.created_at)}</p><p className="mt-1 font-black text-slate-900">{r.full_name} <span className="font-medium text-slate-500">({r.email})</span></p><p className="mt-1 text-sm text-slate-700">Motivo: {r.reason}</p><p className="mt-1 text-sm font-bold text-slate-700">Reembolso: ${money(Number(r.refund_amount))} · {r.refund_method ?? 'Pendiente de revisión'}</p></div>{r.status === 'pending' ? <div className="flex shrink-0 gap-2"><button type="button" disabled={busy===r.id} onClick={() => void reviewCancellation(r.id,true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"><Check className="h-4 w-4"/>Aprobar</button><button type="button" disabled={busy===r.id} onClick={() => void reviewCancellation(r.id,false)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-black text-red-700 disabled:opacity-50"><X className="h-4 w-4"/>Rechazar</button></div> : <span className={`rounded-full px-3 py-1 text-xs font-black ${r.status==='approved'?'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-800'}`}>{r.status==='approved'?'Aprobada':'Rechazada'}</span>}</div></article>)}
      </div>
    </section>

    <section><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-black text-slate-900">Registro remoto</h2><p className="text-sm text-slate-600">{audits.length} eventos persistidos en Supabase.</p></div></div><div className="space-y-2">{audits.map((row) => <article key={`${row.source}-${row.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700">{row.module}</span><span className="font-black text-slate-900">{row.action}</span><span className="text-xs text-slate-400">{row.source}</span></div><p className="mt-1 text-xs text-slate-500">{row.entity_type ?? 'sistema'}{row.entity_id ? ` · ${row.entity_id}` : ''}</p></div><time className="text-xs text-slate-400">{date(row.created_at)}</time></div>{Object.keys(row.metadata ?? {}).length > 0 && <pre className="mt-3 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">{JSON.stringify(row.metadata, null, 2)}</pre>}</article>)}{!loading && audits.length===0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay eventos remotos todavía. El historial local contiene {localHistory.length} eventos de esta sesión.</p>}</div></section>
  </div>;
}
