import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Loader2 } from 'lucide-react';
import { canAccessAdmin } from '../../lib/access';
import { QuickBiteLogo } from './brand/QuickBiteLogo';
import { isVisualPreviewMode } from '../contexts/VisualThemeProvider';

interface ProtectedRouteProps { children: React.ReactNode; }

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuthStore();
  const preview = isVisualPreviewMode();

  if (preview) return <>{children}</>;

  if (loading) return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center"><div className="text-center"><QuickBiteLogo className="mx-auto mb-4 h-14 w-14 rounded-2xl" /><Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-4" /><p className="text-white text-lg">Verificando sesión...</p></div></div>;
  if (!user) return <Navigate to="/login" replace />;

  if (!canAccessAdmin(user.role)) return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center p-4"><div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-md text-center"><QuickBiteLogo className="mx-auto mb-4 h-14 w-14 rounded-2xl" /><div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77-1.333.192-3 1.732 3 1.732 0l10.516-18.204" /></svg></div><h2 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h2><p className="text-white/70 mb-6">Solo administradores pueden acceder a esta sección.</p><button onClick={() => window.location.href = '/login'} className="w-full rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition-all hover:bg-blue-700">Volver al Login</button></div></div>;

  return <>{children}</>;
}
