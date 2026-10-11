import { describe, expect, it } from 'vitest';
import {
  isProtectedAllAccount,
  requiresProtectedFirstAccessPasswordChange,
} from './protectedFirstAccess';

describe('protected first-access password requirement', () => {
  it('matches only the four explicitly protected school accounts', () => {
    expect(isProtectedAllAccount('aldana.jeronimo@maximino.edu.co')).toBe(true);
    expect(isProtectedAllAccount(' COLMENARES.JUAN@MAXIMINO.EDU.CO ')).toBe(true);
    expect(isProtectedAllAccount('useche.diego@maximino.edu.co')).toBe(true);
    expect(isProtectedAllAccount('fernandez.gabriel@maximino.edu.co')).toBe(true);
    expect(isProtectedAllAccount('other@maximino.edu.co')).toBe(false);
    expect(isProtectedAllAccount(null)).toBe(false);
  });

  it('requires both trusted app-metadata flags and a protected email', () => {
    expect(requiresProtectedFirstAccessPasswordChange({
      email: 'aldana.jeronimo@maximino.edu.co',
      app_metadata: { quickbite_protected_account: true, quickbite_must_change_password: true },
    })).toBe(true);
    expect(requiresProtectedFirstAccessPasswordChange({
      email: 'aldana.jeronimo@maximino.edu.co',
      app_metadata: { quickbite_protected_account: true, quickbite_must_change_password: false },
    })).toBe(false);
    expect(requiresProtectedFirstAccessPasswordChange({
      email: 'student@maximino.edu.co',
      app_metadata: { quickbite_protected_account: true, quickbite_must_change_password: true },
    })).toBe(false);
    expect(requiresProtectedFirstAccessPasswordChange({
      email: 'aldana.jeronimo@maximino.edu.co',
      app_metadata: { quickbite_must_change_password: true },
    })).toBe(false);
  });
});
