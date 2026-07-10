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
    if (!loading && user && user.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate]);

  // Mostrar contenido solo si no hay usuario autenticado
  if (user && user.role === 'admin') {
    return null;
  }

  return <>{children}</>;
}
