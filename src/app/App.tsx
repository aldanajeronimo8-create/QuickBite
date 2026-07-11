import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import { needsFirstRunSetup } from '../config/appConfig';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { supabase } from '../lib/supabase';

function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const subscribeRealtime = useDataStore((s) => s.subscribeRealtime);
  const requiresSetup = needsFirstRunSetup();

  useEffect(() => {
    if (requiresSetup) return;
    checkSession();
  }, [checkSession, requiresSetup]);

  useEffect(() => {
    if (requiresSetup) return;
    const supabaseClient = supabase;
    let cleanupRealtime = subscribeRealtime();
    const { data } = supabaseClient?.auth.onAuthStateChange((_event, session) => {
      cleanupRealtime();
      if (session?.access_token) {
        supabaseClient.realtime.setAuth(session.access_token);
      }
      cleanupRealtime = subscribeRealtime();
    }) ?? { data: { subscription: null } };

    return () => {
      cleanupRealtime();
      data.subscription?.unsubscribe();
    };
  }, [requiresSetup, subscribeRealtime]);

  return (
    <>
      <ErrorBoundary>
        {requiresSetup ? <SetupWizardPage /> : <RouterProvider router={router} />}
      </ErrorBoundary>
      <Toaster position="top-center" />
    </>
  );
}

export default App;
