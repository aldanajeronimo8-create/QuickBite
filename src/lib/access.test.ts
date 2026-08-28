import { describe, expect, it } from 'vitest';
import { canAccessAdmin, canAccessStudent } from './access';

describe('combined and protected account access', () => {
  it('lets a combined account access both interfaces', () => {
    expect(canAccessAdmin('both')).toBe(true);
    expect(canAccessStudent('both')).toBe(true);
  });

  it('keeps single-role access scoped to its own interface', () => {
    expect(canAccessAdmin('student')).toBe(false);
    expect(canAccessStudent('admin')).toBe(false);
  });

});
