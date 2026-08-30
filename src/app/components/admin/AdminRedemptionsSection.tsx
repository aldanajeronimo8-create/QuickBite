import { useEffect, useState } from 'react';
import { ChevronDown, Gift } from 'lucide-react';
import { requireSupabaseClient } from '../../../lib/supabase';
import { Badge } from '../ui/badge';

type RedemptionRow = {
  id: string;
  redemption_code: string;
  points_spent?: number | string | null;
  status?: string | null;
  created_at: string;
  reward?: { title?: string | null } | Array<{ title?: string | null }> | null;
  user?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

export function AdminRedemptionsSection() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; redemption_code: string; points_spent: number; status: string; created_at: string; student: string; reward: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await requireSupabaseClient()
          .from('loyalty_redemptions')
          .select('id,redemption_code,points_spent,status,created_at,reward:loyalty_rewards(title),user:profiles!loyalty_redemptions_user_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        if (!active) return;
        setRows(((data ?? []) as RedemptionRow[]).map((row) => ({
          id: row.id,
          redemption_code: row.redemption_code,
          points_spent: Number(row.points_spent ?? 0),
          status: row.status ?? 'pending',
          created_at: row.created_at,
          student: Array.isArray(row.user) ? row.user[0]?.full_name ?? 'Estudiante' : row.user?.full_name ?? 'Estudiante',
          reward: Array.isArray(row.reward) ? row.reward[0]?.title ?? 'Recompensa' : row.reward?.title ?? 'Recompensa',
        })));
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open]);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="flex items-center gap-3 font-bold text-blue-900"><Gift className="h-5 w-5 text-green-700" />Canjes</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5">
          {loading ? <p className="text-sm text-slate-500">Cargando canjes...</p> : rows.length === 0 ? <p className="text-sm text-slate-500">No hay canjes registrados.</p> : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                  <div><p className="font-bold text-slate-900">{row.redemption_code}</p><p className="text-sm text-slate-600">{row.student} · {row.reward}</p></div>
                  <div className="flex items-center gap-2"><Badge variant="outline">{row.points_spent} pts</Badge><Badge>{row.status}</Badge></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
