import { useEffect, useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
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
import { UserThemePreference } from './components/UserThemePreference';
import { VisualThemeProvider, useVisualTheme } from './contexts/VisualThemeProvider';

function syncVisualInterfaceScope(pathname: string) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  const scope = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/parent') ? 'parent' : pathname.startsWith('/menu') || pathname.startsWith('/student') ? 'student' : pathname === '/' || pathname === '/login' ? 'login_student' : null;
  if (scope) body.dataset.qbInterface = scope;
  else delete body.dataset.qbInterface;
  document.documentElement.classList.toggle('qb-public-home', pathname === '/');
}

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

function AdminStudentPreviewBar() {
  const user = useAuthStore((state) => state.user);
  const [active, setActive] = useState(false);
  const [path, setPath] = useState(router.state.location.pathname);
  useEffect(() => {
    const sync = () => { setPath(router.state.location.pathname); try { setActive(window.sessionStorage.getItem('quickbite_admin_student_preview') === '1'); } catch { setActive(false); } };
    sync(); const unsubscribe = router.subscribe(sync); window.addEventListener('storage', sync);
    return () => { unsubscribe(); window.removeEventListener('storage', sync); };
  }, []);
  if (!active || !user || !canAccessAdmin(user.role) || !canAccessStudent(user.role) || (!path.startsWith('/menu') && !path.startsWith('/student'))) return null;
  const returnToAdmin = () => { try { window.sessionStorage.removeItem('quickbite_admin_student_preview'); } catch { /* ignore */ } void router.navigate('/admin'); };
  return <div data-qb-admin-preview="true" className="qb-admin-preview-bar sticky top-0 z-[70] flex items-center justify-between gap-4 border-b px-4 py-3 shadow-sm backdrop-blur-xl sm:px-5 lg:px-8"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl border"><Shield className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em]">Vista previa administrativa</p><p className="truncate text-sm font-semibold">Estás viendo la experiencia de estudiante sin cerrar tu sesión de administrador.</p></div></div><button type="button" onClick={returnToAdmin} className="inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-2"><ArrowLeft className="h-4 w-4" />Volver a Admin</button></div>;
}

function ThemePreferenceBoundary() {
  const { userThemeLoading } = useVisualTheme();
  if (userThemeLoading) return null;
  return null;
}

function AppContent() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const user = useAuthStore((s) => s.user);
  const subscribeRealtime = useDataStore((s) => s.subscribeRealtime);
  const loadData = useDataStore((s) => s.loadData);
  const needsSetup = needsFirstRunSetup();
  const hasSupabase = hasSupabaseConfig();
  useEffect(() => { if (hasSupabase) void checkSession(); }, [checkSession, hasSupabase]);
  useEffect(() => { if (!hasSupabase || !user) return; void loadData({ silent: true }); }, [hasSupabase, loadData, user]);
  useEffect(() => { if (!hasSupabase || !user) return; const cleanupRealtime = subscribeRealtime(); return () => cleanupRealtime(); }, [hasSupabase, subscribeRealtime, user]);
  useEffect(() => { syncVisualInterfaceScope(router.state.location.pathname); return router.subscribe((state) => syncVisualInterfaceScope(state.location.pathname)); }, []);
  return <ErrorBoundary><VisualThemeProvider>{needsSetup ? <SetupWizardPage /> : <><RouterProvider router={router} /><AdminStudentPreviewBar /><SessionRestorer />{user && <UserThemePreference />}<ThemePreferenceBoundary /></>}<Toaster position="top-center" /></VisualThemeProvider></ErrorBoundary>;
}
export default AppContent;
