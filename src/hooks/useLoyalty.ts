import { useCallback, useEffect, useMemo, useState } from 'react';
import { appConfig } from '../config/appConfig';
import { getErrorMessage } from '../lib/getErrorMessage';
import { requireSupabaseClient, type LoyaltyRedemption, type LoyaltyReward, type LoyaltySettings, type Order } from '../lib/supabase';
import {
  getLoyaltySettings,
  listLoyaltyRewards,
  listUserLoyaltyRedemptions,
  redeemLoyaltyReward,
} from '../repositories/quickbiteRepository';

function calculatePoints(userId: string, orders: Order[], settings: LoyaltySettings | null, redemptions: LoyaltyRedemption[]) {
  if (!settings) return 0;

  const earned = orders
    .filter((order) => order.user_id === userId && order.payment_status === 'confirmed')
    .reduce(
      (total, order) =>
        total + Math.floor(Number(order.total) / settings.currency_amount) * settings.points_per_amount,
      0,
    );
  const redeemed = redemptions
    .filter((redemption) => redemption.status !== 'cancelled')
    .reduce((total, redemption) => total + redemption.points_spent, 0);

  return Math.max(0, earned - redeemed);
}

export function useLoyalty(userId: string | undefined, orders: Order[]) {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [nextSettings, nextRewards, nextRedemptions] = await Promise.all([
        getLoyaltySettings(),
        listLoyaltyRewards(),
        listUserLoyaltyRedemptions(userId),
      ]);
      setSettings(nextSettings);
      setRewards(nextRewards);
      setRedemptions(nextRedemptions);
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause, 'No pudimos cargar los puntos y premios.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    const interval = window.setInterval(() => void refresh(), appConfig.loyaltyRefreshIntervalMs);
    if (!appConfig.supabaseRealtimeEnabled) return () => window.clearInterval(interval);

    const client = requireSupabaseClient();
    const channel = client
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
      void client.removeChannel(channel);
    };
  }, [refresh, userId]);

  const points = useMemo(
    () => calculatePoints(userId ?? '', orders, settings, redemptions),
    [orders, redemptions, settings, userId],
  );

  const redeem = useCallback(
    async (rewardId: string) => {
      try {
        await redeemLoyaltyReward(rewardId);
        await refresh();
      } catch (cause) {
        const message = getErrorMessage(cause, 'No pudimos registrar el canje.');
        setError(message);
        throw new Error(message);
      }
    },
    [refresh],
  );

  return { settings, rewards, redemptions, points, loading, error, refresh, redeem };
}
