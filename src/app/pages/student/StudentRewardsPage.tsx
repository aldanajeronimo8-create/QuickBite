import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Star } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type LoyaltyReward } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';
import { useLoyalty } from '../../hooks/useLoyalty';
import { StudentRewardsPanel } from '../../components/student/StudentRewardsPanel';

export function StudentRewardsPage() {
  const navigate = useNavigate();
  const { orders, loadData } = useDataStore();
  const [userId, setUserId] = useState<string | null>(null);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const client = requireSupabaseClient();
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id;
      if (!id) { navigate('/'); return; }
      setUserId(id);
      await loadData();
    })();
  }, [loadData, navigate]);
  const loyalty = useLoyalty(userId ?? undefined, orders);
  const handleRedeem = async (reward: LoyaltyReward) => {
    setRedeemingRewardId(reward.id);
    try { await loyalty.redeem(reward.id); toast.success('Canje solicitado. Admin debe aprobarlo.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo completar el canje.'); }
    finally { setRedeemingRewardId(null); }
  };
  if (!userId) return null;
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),#f5f8f7] p-5 sm:p-8 text-slate-900"><div className="mx-auto max-w-4xl space-y-5"><header className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><Link to="/student/features" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4"/>Funciones</Link><div className="mt-4 flex items-center gap-3"><Star className="h-7 w-7 text-emerald-700"/><div><h1 className="text-3xl font-black">Puntos y recompensas</h1><p className="text-sm text-slate-600">Consulta tus puntos y canjea recompensas disponibles.</p></div></div></header><div className="rounded-[2rem] border border-white/60 bg-white/70 p-3 shadow-xl backdrop-blur-2xl"><StudentRewardsPanel availablePoints={loyalty.availablePoints} error={loyalty.error} loading={loyalty.loading} onRedeem={handleRedeem} redeemingRewardId={redeemingRewardId} redemptions={loyalty.redemptions} rewards={loyalty.rewards} /></div><Link to="/menu" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><Gift className="h-4 w-4"/>Volver a comprar</Link></div></div>;
}
