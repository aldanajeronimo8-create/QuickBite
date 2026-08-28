import { describe, expect, it } from 'vitest';
import { isProtectedAdminEmail, protectedAdminEmails } from './protectedAccounts';

describe('protected administrator accounts', () => {
  it('keeps exactly the five designated accounts protected', () => {
    expect(protectedAdminEmails.size).toBe(5);
    expect(isProtectedAdminEmail(' Aldana.Jeronimo@maximino.edu.co ')).toBe(true);
    expect(isProtectedAdminEmail('usuario.no.protegido@maximino.edu.co')).toBe(false);
  });
});
