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

const sensitiveKeyPattern = /password|passphrase|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|jwt|credential/i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    return value
      .replace(/(bearer\s+)[^\s]+/gi, '$1[redacted]')
      .replace(/([?&](?:token|secret|key|password)=)[^&\s]+/gi, '$1[redacted]');
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key) ? '[redacted]' : sanitizeValue(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function sanitizeAuditMetadata(metadata?: Record<string, unknown>) {
  return (sanitizeValue(metadata ?? {}) as Record<string, unknown>);
}

export function writeAuditLog(entry: Omit<AuditEntry, 'id' | 'createdAt'>) {
  const next: AuditEntry = {
    id: crypto.randomUUID?.() ?? `audit-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
    metadata: sanitizeAuditMetadata(entry.metadata),
  };
  if (import.meta.env.DEV) {
    console.info('[audit]', next);
  }
  return next;
}

export function getAuditLog(): AuditEntry[] { return []; }
