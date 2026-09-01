import { useEffect, useState } from 'react';
import { appConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { getLoyaltySettings } from '../../repositories/quickbiteRepository';

export function useLoyaltyProgram() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof requireSupabaseClient>['channel']> | null = null;
    let interval: ReturnType<typeof window.setInterval> | null = null;

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
    interval = window.setInterval(() => void refresh(), Math.max(appConfig.dataRefreshIntervalMs, 15_000));

    if (appConfig.supabaseRealtimeEnabled) {
      const supabase = requireSupabaseClient();
      channel = supabase
        .channel('quickbite-loyalty-program-status')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_settings' }, () => void refresh())
        .subscribe();
    }

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      if (channel) void requireSupabaseClient().removeChannel(channel);
    };
  }, []);

  return { enabled, loading };
}
