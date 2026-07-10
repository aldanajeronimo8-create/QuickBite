import { useCallback, useEffect, useMemo, useState } from 'react';
import { appConfig } from '../../config/appConfig';
import { getErrorMessage } from '../../lib/errorMessage';
import { requireSupabaseClient, type LoyaltyRedemption, type LoyaltyReward, type LoyaltySettings, type Order } from '../../lib/supabase';
import { getLoyaltySettings, listLoyaltyRewards, listUserLoyaltyRedemptions, redeemLoyaltyReward } from '../../repositories/quickbiteRepository';

export function useLoyalty(userId: string | undefined, orders: Order[]) {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [nextSettings, nextRewards, nextRedemptions] = await Promise.all([
        getLoyaltySettings(),
        listLoyaltyRewards(),
        listUserLoyaltyRedemptions(userId),
      ]);
      setSettings(nextSettings);
      setRewards(nextRewards);
      setRedemptions(nextRedemptions);
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'No se pudo cargar el programa de puntos.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();

    const refreshDelay = Math.max(appConfig.dataRefreshIntervalMs, 15_000);
    const interval = window.setInterval(() => void refresh(), refreshDelay);
    if (!appConfig.supabaseRealtimeEnabled) {
      return () => window.clearInterval(interval);
    }

    const supabase = requireSupabaseClient();
    const channel = supabase
      .channel(`loyalty-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_settings' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_rewards' }, () => void refresh())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loyalty_redemptions', filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const earnedPoints = useMemo(() => {
    const unit = settings?.points_per_currency_unit ?? 1000;
    const confirmedTotal = orders
      .filter((order) => order.payment_status === 'confirmed')
      .reduce((sum, order) => sum + Number(order.total), 0);
    return Math.floor(confirmedTotal / unit);
  }, [orders, settings?.points_per_currency_unit]);

  const spentPoints = useMemo(
    () => redemptions
      .filter((redemption) => redemption.status === 'reserved' || redemption.status === 'fulfilled')
      .reduce((sum, redemption) => sum + redemption.points_spent, 0),
    [redemptions],
  );

  const redeem = useCallback(async (rewardId: string) => {
    const redemption = await redeemLoyaltyReward(rewardId);
    await refresh();
    return redemption;
  }, [refresh]);

  return {
    availablePoints: Math.max(earnedPoints - spentPoints, 0),
    enabled: settings?.enabled === true,
    error,
    loading,
    redeem,
    redemptions,
    rewards,
  };
}
