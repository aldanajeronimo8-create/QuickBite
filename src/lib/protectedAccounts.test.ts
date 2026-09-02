import { describe, expect, it } from 'vitest';
import { isProtectedAdminEmail, protectedAdminEmails } from './protectedAccounts';

describe('protected administrator accounts', () => {
  it('keeps all designated accounts protected, including the E2E verification account', () => {
    expect(protectedAdminEmails.size).toBe(6);
    expect(isProtectedAdminEmail(' Aldana.Jeronimo@maximino.edu.co ')).toBe(true);
    expect(isProtectedAdminEmail('quickbitejgf@gmail.com')).toBe(true);
    expect(isProtectedAdminEmail('usuario.no.protegido@maximino.edu.co')).toBe(false);
  });
});
