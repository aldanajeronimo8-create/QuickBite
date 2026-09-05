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
import { getVisualPreviewScope, isVisualPreviewMode } from './contexts/VisualThemeProvider';

const BROKEN_IMAGE_FALLBACK =
  'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 240 180%22%3E%3Crect width=%22240%22 height=%22180%22 rx=%2224%22 fill=%22%23F1F5F9%22/%3E%3Cpath d=%22M76 120h88c-4-24-20-38-44-38s-40 14-44 38Z%22 fill=%22%2394A3B8%22/%3E%3Cpath d=%22M72 124h96%22 stroke=%22%23647569%22 stroke-width=%226%22 stroke-linecap=%22round%22/%3E%3Ccircle cx=%22103%22 cy=%2270%22 r=%228%22 fill=%22%2394A3B8%22/%3E%3Ccircle cx=%22120%22 cy=%2262%22 r=%226%22 fill=%22%23CBD5E1%22/%3E%3Ccircle cx=%22138%22 cy=%2270%22 r=%227%22 fill=%22%2394A3B8%22/%3E%3C/svg%3E';

function GlobalImageFallback() {
  useEffect(() => {
    const handleImageError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (target.dataset.qbImageFallback === '1') return;
      target.dataset.qbImageFallback = '1';
      target.removeAttribute('srcset');
      target.src = BROKEN_IMAGE_FALLBACK;
    };

    window.addEventListener('error', handleImageError, true);
    return () => window.removeEventListener('error', handleImageError, true);
  }, []);

  return null;
}

function SessionRestorer() {
  useEffect(() => {
    if (isVisualPreviewMode()) return;
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
        if (context === 'admin' && canAccessAdmin(profile.role)) await router.navigate('/admin', { replace: true });
        else if (context === 'user' && canAccessParent(profile.role)) await router.navigate('/parent/family', { replace: true });
        else if (context === 'user' && canAccessStudent(profile.role)) await router.navigate('/menu', { replace: true });
      } catch (error) {
        console.warn('[QuickBite] No se pudo restaurar la sesión automáticamente.', error);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);
  return null;
}

function PreviewSessionBootstrap() {
  useEffect(() => {
    if (!isVisualPreviewMode()) return;
    const scope = getVisualPreviewScope();
    const role = scope === 'admin' || scope === 'login_admin' ? 'admin' : scope === 'parent' || scope === 'login_parent' ? 'parent' : 'student';
    const now = new Date().toISOString();
    useAuthStore.setState({
      user: { id: `visual-preview-${role}`, email: `${role}@preview.local`, full_name: `Vista previa ${role}`, role, ti: null, created_at: now },
      session: { token: 'visual-preview' },
      loading: false,
    });
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
  const visualPreview = isVisualPreviewMode();

  useEffect(() => {
    if (hasSupabase && !visualPreview) void checkSession();
  }, [checkSession, hasSupabase, visualPreview]);

  useEffect(() => {
    if (!hasSupabase || !user || visualPreview) return;
    void loadData({ silent: true });
  }, [hasSupabase, loadData, user, visualPreview]);

  useEffect(() => {
    if (!hasSupabase || !user || visualPreview) return;
    const cleanupRealtime = subscribeRealtime();
    return () => cleanupRealtime();
  }, [hasSupabase, subscribeRealtime, user, visualPreview]);

  return <VisualThemeProvider><GlobalImageFallback /><ErrorBoundary>{needsSetup ? <SetupWizardPage /> : <><RouterProvider router={router} /><PreviewSessionBootstrap />{!visualPreview && <SessionRestorer />}</>}</ErrorBoundary><Toaster position="top-center" /></VisualThemeProvider>;
}

export default App;
