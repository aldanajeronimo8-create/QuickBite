export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.signup'
  | 'auth.error'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'order.create'
  | 'order.update'
  | 'order.status_change'
  | 'payment.update'
  | 'app.error'
  | 'settings.update';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorId?: string;
  actorEmail?: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function writeAuditLog(entry: Omit<AuditEntry, 'id' | 'createdAt'>) {
  const next: AuditEntry = {
    id: crypto.randomUUID?.() ?? `audit-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  if (import.meta.env.DEV) {
    console.info('[audit]', next);
  }
  return next;
}

export function getAuditLog(): AuditEntry[] { return []; }
