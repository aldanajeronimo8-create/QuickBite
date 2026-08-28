/**
 * These are the only accounts that must never be edited or deleted from the
 * administration panel. Supabase enforces the same allowlist server-side.
 */
export const protectedAdminEmails = new Set([
  'colmenares.juan@maximino.edu.co',
  'aldana.jeronimo@maximino.edu.co',
  'jeronimoaldana901@gmail.com',
  'fernandez.gabriel@maximino.edu.co',
  'useche.diego@maximino.edu.co',
]);

export function isProtectedAdminEmail(email: string) {
  return protectedAdminEmails.has(email.trim().toLowerCase());
}
