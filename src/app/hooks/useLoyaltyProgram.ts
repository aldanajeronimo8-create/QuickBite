import { useEffect, useState } from 'react';
import { appConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { getLoyaltySettings } from '../../repositories/quickbiteRepository';

export function useLoyaltyProgram() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let refreshInterval: ReturnType<typeof setInterval> | undefined;
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

    void refresh();
    refreshInterval = window.setInterval(() => void refresh(), Math.max(appConfig.dataRefreshIntervalMs, 15_000));

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
      if (refreshInterval) window.clearInterval(refreshInterval);
      removeRealtime?.();
    };
  }, []);

  return { enabled, loading };
}
