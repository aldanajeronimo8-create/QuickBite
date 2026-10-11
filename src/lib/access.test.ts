import { describe, expect, it } from 'vitest';
import { canAccessAdmin, canAccessParent, canAccessStaff, canAccessStudent } from './access';

describe('combined and administrative preview access', () => {
  it('lets a combined account access admin and student interfaces', () => {
    expect(canAccessAdmin('both')).toBe(true);
    expect(canAccessStudent('both')).toBe(true);
    expect(canAccessParent('both')).toBe(false);
    expect(canAccessStaff('both')).toBe(false);
  });

  it('grants the canonical all role access to all four interfaces through one condition', () => {
    for (const canAccess of [canAccessAdmin, canAccessParent, canAccessStaff, canAccessStudent]) {
      expect(canAccess('all')).toBe(true);
    }
  });

  it('keeps normal single-role access scoped while allowing admin student preview', () => {
    expect(canAccessAdmin('student')).toBe(false);
    expect(canAccessStudent('admin')).toBe(true);
    expect(canAccessStudent('student')).toBe(true);
    expect(canAccessAdmin('parent')).toBe(false);
    expect(canAccessStaff('parent')).toBe(false);
  });
});
