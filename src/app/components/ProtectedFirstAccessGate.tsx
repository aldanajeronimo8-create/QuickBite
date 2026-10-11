import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { getAuthContext, getSupabaseClientForContext } from '../../lib/supabase';
import { requiresProtectedFirstAccessPasswordChange } from '../../lib/protectedFirstAccess';

/**
 * Route-wide guard for protected accounts that still use their temporary
 * password. It wraps every route (including public registration routes) so a
 * pending protected account can only reach the dedicated password-change page.
 */
export function ProtectedFirstAccessGate() {
  const location = useLocation();
  const [gateState, setGateState] = useState<'checking' | 'open' | 'required' | 'error'>('checking');

  useEffect(() => {
    let active = true;
    setGateState('checking');

    const client = getSupabaseClientForContext(getAuthContext());
    if (!client) {
      setGateState('open');
      return undefined;
    }

    const evaluate = (user: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null) => {
      if (!active) return;
      setGateState(requiresProtectedFirstAccessPasswordChange(user) ? 'required' : 'open');
    };

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      evaluate(session?.user ?? null);
    });

    void client.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        evaluate(data.session?.user ?? null);
      })
      .catch(() => {
        // Fail closed if the active session cannot be inspected; do not guess that the account is activated.
        if (active) setGateState('error');
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [location.pathname]);

  const onPasswordPage = location.pathname === '/protected-first-access';

  if (gateState === 'error') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
        <div className="max-w-md rounded-2xl border border-amber-200/20 bg-white/5 p-6 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-amber-300" aria-hidden="true" />
          <h1 className="text-lg font-bold">No se pudo verificar la sesión</h1>
          <p className="mt-2 text-sm leading-6 text-white/75">Por seguridad, QuickBite no abrirá otros espacios hasta poder verificar el estado de la cuenta. Recarga la página para volver a intentarlo.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-800 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-900">Volver a comprobar</button>
        </div>
      </main>
    );
  }

  if (gateState === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-cyan-300" aria-hidden="true" />
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" aria-hidden="true" />
          <p className="mt-4 text-sm text-white/75">Verificando la seguridad de la cuenta…</p>
        </div>
      </main>
    );
  }

  if (gateState === 'required' && !onPasswordPage) {
    return <Navigate to="/protected-first-access" replace state={{ from: location.pathname }} />;
  }

  if (gateState !== 'required' && onPasswordPage) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
