import { useEffect, useState } from 'react';
import { appConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { getLoyaltySettings } from '../../repositories/quickbiteRepository';
import { useAuthStore } from '../../store/authStore';

export function useLoyaltyProgram() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      setEnabled(false);
      setLoading(false);
      return undefined;
    }

    let active = true;
    let removeRealtime: (() => void) | undefined;

    const refresh = async () => {
      try {
        const settings = await getLoyaltySettings();
        if (active) setEnabled(settings.enabled === true);
      } catch {
        if (active) setEnabled(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    void refresh();
    const refreshInterval = window.setInterval(
      () => void refresh(),
      Math.max(appConfig.dataRefreshIntervalMs, 15_000),
    );

    if (appConfig.supabaseRealtimeEnabled) {
      const supabase = requireSupabaseClient();
      const channel = supabase
        .channel('quickbite-loyalty-program-status')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_settings' }, () => void refresh())
        .subscribe();
      removeRealtime = () => { void supabase.removeChannel(channel); };
    }

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      removeRealtime?.();
    };
  }, [authLoading, user]);

  return { enabled, loading };
}