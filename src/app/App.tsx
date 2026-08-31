import { useEffect } from 'react';
import { RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import { hasSupabaseConfig, needsFirstRunSetup } from '../config/appConfig';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { supabase } from '../lib/supabase';
import { canAccessAdmin, canAccessStudent } from '../lib/access';

function SessionRestorer() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient) return;
    let cancelled = false;
    const restore = async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (cancelled || !data.session?.user) return;
        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles').select('id,role').eq('id', data.session.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (cancelled || !profile) return;
        if (location.pathname !== '/' && location.pathname !== '/login') return;
        if (canAccessAdmin(profile.role)) navigate('/admin', { replace: true });
        else if (canAccessStudent(profile.role)) navigate('/menu', { replace: true });
      } catch (error) {
        // A stale/corrupt persisted session must not crash the whole React tree.
        // Supabase will emit SIGNED_OUT/TOKEN_REFRESHED when it can recover the session.
        console.warn('[QuickBite] No se pudo restaurar la sesión automáticamente.', error);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [location.pathname, navigate]);
  return null;
}

function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const subscribeRealtime = useDataStore((s) => s.subscribeRealtime);
  const needsSetup = needsFirstRunSetup();
  const hasSupabase = hasSupabaseConfig();

  useEffect(() => {
    if (hasSupabase) void checkSession();
  }, [checkSession, hasSupabase]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!hasSupabase || !supabaseClient) return;
    let cleanupRealtime = subscribeRealtime();
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      cleanupRealtime();
      if (session?.access_token) supabaseClient.realtime.setAuth(session.access_token);
      cleanupRealtime = subscribeRealtime();
    });
    return () => { cleanupRealtime(); data.subscription?.unsubscribe(); };
  }, [hasSupabase, subscribeRealtime]);

  return <><ErrorBoundary>{needsSetup ? <SetupWizardPage /> : <><RouterProvider router={router} /><SessionRestorer /></>}</ErrorBoundary><Toaster position="top-center" /></>;
}

export default App;
