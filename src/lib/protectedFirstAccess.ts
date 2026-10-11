/**
 * First-access password rotation applies only to the four explicitly protected
 * QuickBite school accounts. The requirement marker is kept in app_metadata,
 * which ordinary users cannot edit through the client SDK.
 */
export const PROTECTED_ALL_ACCOUNT_EMAILS = [
  'aldana.jeronimo@maximino.edu.co',
  'colmenares.juan@maximino.edu.co',
  'useche.diego@maximino.edu.co',
  'fernandez.gabriel@maximino.edu.co',
] as const;

export function isProtectedAllAccount(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return PROTECTED_ALL_ACCOUNT_EMAILS.some((candidate) => candidate === normalized);
}

export function requiresProtectedFirstAccessPasswordChange(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!user || !isProtectedAllAccount(user.email)) return false;
  return user.app_metadata?.quickbite_protected_account === true
    && user.app_metadata?.quickbite_must_change_password === true;
}
