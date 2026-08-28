import { Gift, LoaderCircle, LockKeyhole, TicketCheck, Trophy } from 'lucide-react';
import { Button } from '../ui/button';
import type { LoyaltyRedemption, LoyaltyReward } from '../../../lib/supabase';

type Props = {
  availablePoints: number;
  error: string | null;
  loading: boolean;
  onRedeem: (reward: LoyaltyReward) => void;
  redeemingRewardId: string | null;
  redemptions: LoyaltyRedemption[];
  rewards: LoyaltyReward[];
};

export function StudentRewardsPanel({
  availablePoints,
  error,
  loading,
  onRedeem,
  redeemingRewardId,
  redemptions,
  rewards,
}: Props) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-5 pt-6 lg:px-8">
      <section className="rounded-3xl bg-[#166534] p-5 text-white shadow-lg shadow-green-950/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-green-100">Puntos disponibles</p>
            <p className="mt-1 text-5xl font-black">{availablePoints}</p>
            <p className="mt-2 text-sm text-white/70">Usa tus puntos para reservar alimentos del menu.</p>
          </div>
          <Trophy className="h-9 w-9 text-green-200" />
        </div>
      </section>

      {error && <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black">Recompensas disponibles</h2>
          {loading && <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" aria-label="Cargando recompensas" />}
        </div>
        <div className="grid gap-3">
          {!loading && rewards.length === 0 && (
            <div className="border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
              No hay recompensas activas por ahora.
            </div>
          )}
          {rewards.map((reward) => {
            const canRedeem = availablePoints >= reward.points_required;
            const missingPoints = reward.points_required - availablePoints;
            const redeeming = redeemingRewardId === reward.id;
            return (
              <article key={reward.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {reward.product?.image_url ? (
                  <img src={reward.product.image_url} alt={reward.title} className="h-20 w-20 shrink-0 object-cover" />
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center bg-green-50 text-green-600"><Gift className="h-7 w-7" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black">{reward.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{reward.description || reward.product?.name}</p>
                    </div>
                    <span className="shrink-0 bg-green-50 px-2 py-1 text-xs font-black text-green-700">{reward.points_required} pts</span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => onRedeem(reward)}
                    disabled={!canRedeem || redeeming}
                    className="mt-3 w-full bg-green-600 text-white hover:bg-green-700"
                  >
                    {redeeming ? 'Reservando...' : canRedeem ? 'Canjear alimento' : `Te faltan ${missingPoints} pts`}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {redemptions.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-black">Tus canjes</h2>
          <div className="divide-y border border-slate-100 bg-white">
            {redemptions.slice(0, 5).map((redemption) => (
              <div key={redemption.id} className="flex items-center gap-3 px-4 py-3">
                {redemption.status === 'reserved' ? <TicketCheck className="h-5 w-5 text-emerald-500" /> : <LockKeyhole className="h-5 w-5 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{redemption.reward?.title ?? 'Recompensa'}</p>
                  <p className="text-xs text-slate-500">Codigo: {redemption.redemption_code}</p>
                </div>
                <span className="text-xs font-bold text-slate-500">{redemption.status === 'reserved' ? 'Para recoger' : redemption.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
