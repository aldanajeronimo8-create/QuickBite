import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getStaffCoreSession, loadStaffCapabilities } from '../../lib/coreApi';

export function StaffCoreGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const session = getStaffCoreSession();
      if (!session) {
        if (!cancelled) setState('denied');
        return;
      }
      try {
        const capabilities = await loadStaffCapabilities();
        if (!cancelled) setState(capabilities.role === 'staff' && capabilities.operations ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    }
    void verify();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  if (state === 'denied') return <Navigate to="/staff/login" replace />;
  return <>{children}</>;
}
