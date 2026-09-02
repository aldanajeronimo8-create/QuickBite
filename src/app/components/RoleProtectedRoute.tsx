import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { canAccessAdmin, canAccessParent, canAccessStudent, type UserRole } from '../../lib/access';
import { QuickBiteLogo } from './brand/QuickBiteLogo';

interface RoleProtectedRouteProps {
  role: Exclude<UserRole, 'both'>;
  children: ReactNode;
}

function canAccess(role: UserRole, required: RoleProtectedRouteProps['role']) {
  if (required === 'admin') return canAccessAdmin(role);
  if (required === 'parent') return canAccessParent(role);
  return canAccessStudent(role);
}

export function RoleProtectedRoute({ role, children }: RoleProtectedRouteProps) {
  const { user, loading } = useAuthStore();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><QuickBiteLogo className="mx-auto mb-4 h-14 w-14 rounded-2xl" /><Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" /><p className="mt-3 text-sm font-bold text-slate-600">Verificando sesión...</p></div></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!canAccess(user.role, role)) {
    const destination = canAccessAdmin(user.role) ? '/admin' : canAccessParent(user.role) ? '/parent/family' : canAccessStudent(user.role) ? '/menu' : '/login';
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
