import { describe, expect, it } from 'vitest';
import { canAccessAdmin, canAccessStudent } from './access';

describe('combined and administrative preview access', () => {
  it('lets a combined account access both interfaces', () => {
    expect(canAccessAdmin('both')).toBe(true);
    expect(canAccessStudent('both')).toBe(true);
  });

  it('keeps normal single-role access scoped while allowing admin student preview', () => {
    expect(canAccessAdmin('student')).toBe(false);
    expect(canAccessStudent('admin')).toBe(true);
    expect(canAccessStudent('student')).toBe(true);
    expect(canAccessAdmin('parent')).toBe(false);
  });
});
