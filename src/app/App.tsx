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
import { getVisualPreviewScope, isVisualPreviewMode, VisualThemeProvider } from './contexts/VisualThemeProvider';
import { VisualPreviewEditor } from './components/visual/VisualPreviewEditor';
import { UserThemePreference } from './components/UserThemePreference';

function safeIsVisualPreviewMode(): boolean {
  try { return isVisualPreviewMode(); } catch { return false; }
}

function syncVisualInterfaceScope(pathname: string) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  const scope = pathname.startsWith('/admin')
    ? 'admin'
    : pathname.startsWith('/parent')
      ? 'parent'
      : pathname.startsWith('/menu') || pathname.startsWith('/student')
        ? 'student'
        : pathname === '/' || pathname === '/login'
          ? 'login_student'
          : null;
  if (scope) body.dataset.qbInterface = scope;
  else delete body.dataset.qbInterface;
  document.documentElement.classList.toggle('qb-public-home', pathname === '/');
}

function SessionRestorer() {
  useEffect(() => {
    if (safeIsVisualPreviewMode()) return;
    let cancelled = false;
    const restore = async () => {
      try {
        const context = getAuthContext();
        const supabaseClient = getSupabaseClientForContext(context);
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (cancelled || !data.session?.user) return;
        const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('id,role').eq('id', data.session.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (cancelled || !profile) return;
        const pathname = window.location.pathname;
        if (pathname !== '/' && pathname !== '/login') return;
        if (context === 'admin' && canAccessAdmin(profile.role)) await router.navigate('/admin', { replace: true });
        else if (context === 'user' && canAccessParent(profile.role)) await router.navigate('/parent/family', { replace: true });
        else if (context === 'user' && canAccessStudent(profile.role)) await router.navigate('/menu', { replace: true });
      } catch (error) { console.warn('[QuickBite] No se pudo restaurar la sesión automáticamente.', error); }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);
  return null;
}

function PreviewSessionBootstrap() {
  useEffect(() => {
    if (!safeIsVisualPreviewMode()) return;
    const scope = getVisualPreviewScope();
    const role = scope === 'admin' || scope === 'login_admin' ? 'admin' : scope === 'parent' || scope === 'login_parent' ? 'parent' : 'student';
    const now = new Date().toISOString();
    useAuthStore.setState({ user: { id: `visual-preview-${role}`, email: `${role}@preview.local`, full_name: `Vista previa ${role}`, role, ti: null, created_at: now }, session: { token: 'visual-preview' }, loading: false });
  }, []);
  return null;
}

function VisualRouteSynchronizer() {
  useEffect(() => {
    const sync = () => syncVisualInterfaceScope(router.state.location.pathname);
    sync();
    return router.subscribe((state) => syncVisualInterfaceScope(state.location.pathname));
  }, []);
  return null;
}

function AppContent() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const user = useAuthStore((s) => s.user);
  const subscribeRealtime = useDataStore((s) => s.subscribeRealtime);
  const loadData = useDataStore((s) => s.loadData);
  const needsSetup = needsFirstRunSetup();
  const visualPreview = safeIsVisualPreviewMode();
  const hasSupabase = hasSupabaseConfig();

  useEffect(() => { if (hasSupabase && !visualPreview) void checkSession(); }, [checkSession, hasSupabase, visualPreview]);
  useEffect(() => { if (!hasSupabase || !user || visualPreview) return; void loadData({ silent: true }); }, [hasSupabase, loadData, user, visualPreview]);
  useEffect(() => { if (!hasSupabase || !user || visualPreview) return; const cleanupRealtime = subscribeRealtime(); return () => cleanupRealtime(); }, [hasSupabase, subscribeRealtime, user, visualPreview]);

  return (
    <ErrorBoundary>
      <VisualThemeProvider>
        {needsSetup ? <SetupWizardPage /> : <><RouterProvider router={router} /><VisualRouteSynchronizer /><PreviewSessionBootstrap />{visualPreview && <VisualPreviewEditor scope={getVisualPreviewScope() ?? 'student'} />}{!visualPreview && <SessionRestorer />}{!visualPreview && user && <UserThemePreference />}</>}
        <Toaster position="top-center" />
      </VisualThemeProvider>
    </ErrorBoundary>
  );
}

export default AppContent;
