import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import { hasSupabaseConfig, needsFirstRunSetup } from '../config/appConfig';
import { getAuthContext, getSupabaseClientForContext } from '../lib/supabase';
import { canAccessAdmin, canAccessParent, canAccessStudent } from '../lib/access';

function SessionRestorer() {
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const context = getAuthContext();
        const supabaseClient = getSupabaseClientForContext(context);
        if (!supabaseClient) return;

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (cancelled || !data.session?.user) return;

        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('id,role')
          .eq('id', data.session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (cancelled || !profile) return;

        const pathname = window.location.pathname;
        if (pathname !== '/' && pathname !== '/login') return;
        if (context === 'admin' && canAccessAdmin(profile.role)) {
          await router.navigate('/admin', { replace: true });
        } else if (context === 'user' && canAccessParent(profile.role)) {
          await router.navigate('/parent/family', { replace: true });
        } else if (context === 'user' && canAccessStudent(profile.role)) {
          await router.navigate('/menu', { replace: true });
        }
      } catch (error) {
        console.warn('[QuickBite] No se pudo restaurar la sesión automáticamente.', error);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);
  return null;
}

function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const user = useAuthStore((s) => s.user);
  const subscribeRealtime = useDataStore((s) => s.subscribeRealtime);
  const loadData = useDataStore((s) => s.loadData);
  const needsSetup = needsFirstRunSetup();
  const hasSupabase = hasSupabaseConfig();

  useEffect(() => {
    if (hasSupabase) void checkSession();
  }, [checkSession, hasSupabase]);

  useEffect(() => {
    if (!hasSupabase || !user) return;
    void loadData({ silent: true });
  }, [hasSupabase, loadData, user]);

  useEffect(() => {
    if (!hasSupabase || !user) return;
    const cleanupRealtime = subscribeRealtime();
    return () => cleanupRealtime();
  }, [hasSupabase, subscribeRealtime, user]);

  return <><ErrorBoundary>{needsSetup ? <SetupWizardPage /> : <><RouterProvider router={router} /><SessionRestorer /></>}</ErrorBoundary><Toaster position="top-center" /></>;
}

export default App;
