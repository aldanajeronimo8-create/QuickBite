import React from 'react';
import { Button } from '../ui/button';
import { monitoring } from '../../../lib/monitoring';
import { writeAuditLog } from '../../../lib/auditLog';
import { QuickBiteLogo } from '../brand/QuickBiteLogo';

interface State { hasError: boolean; message?: string }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    monitoring.captureError(error, { componentStack: info.componentStack });
    writeAuditLog({ action: 'app.error', metadata: { message: error.message, componentStack: info.componentStack } });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <QuickBiteLogo className="mb-5 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-black mb-2">Algo salió mal</h1>
          <p className="text-slate-700 mb-6">La app se recuperó de un error inesperado. Puedes recargar e intentarlo otra vez.</p>
          <Button onClick={() => window.location.reload()} className="rounded-2xl bg-blue-600 px-6 text-white hover:bg-blue-700">Recargar</Button>
        </div>
      </div>
    );
  }
}
