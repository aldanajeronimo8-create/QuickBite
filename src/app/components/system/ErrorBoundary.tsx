import React from 'react';
import { Button } from '../ui/button';
import { monitoring } from '../../../lib/monitoring';
import { writeAuditLog } from '../../../lib/auditLog';

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    monitoring.captureError(error, { componentStack: info.componentStack });
    writeAuditLog({
      action: 'app.error',
      metadata: { message: error.message, componentStack: info.componentStack },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#fff7e8] p-6 text-[#14213d] grid place-items-center">
        <div className="max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-orange-100 text-center">
          <h1 className="text-2xl font-black mb-2">Algo salió mal</h1>
          <p className="text-slate-700 mb-6">
            La app se recuperó de un error inesperado. Puedes recargar e intentarlo otra vez.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="bg-orange-500 text-white rounded-2xl px-6"
          >
            Recargar
          </Button>
        </div>
      </div>
    );
  }
}
