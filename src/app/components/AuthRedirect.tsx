import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface AuthRedirectProps {
  children: React.ReactNode;
}

export function AuthRedirect({ children }: AuthRedirectProps) {
  const navigate = useNavigate();
  const { user, loading } = useAuthStore();

  useEffect(() => {
    // Si el usuario ya está autenticado, redirigir al dashboard
    if (!loading && user && ['admin', 'both'].includes(user.role)) {
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate]);

  // Mostrar contenido solo si no hay usuario autenticado
  if (user && ['admin', 'both'].includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
