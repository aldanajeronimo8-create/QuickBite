import { useEffect, useState } from 'react';
import { requireSupabaseClient } from '../../../lib/supabase';
import { StudentFeatureHub } from './StudentFeatureHub';

/** Mounts the platform feature hub alongside the existing Student menu without duplicating the menu UI. */
export function StudentPlatformBridge() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = requireSupabaseClient();
    void client.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return userId ? <StudentFeatureHub userId={userId} /> : null;
}
