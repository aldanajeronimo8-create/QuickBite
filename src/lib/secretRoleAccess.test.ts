import { describe, expect, it } from 'vitest';
import {
  registerSecretRoleTap,
  SECRET_TAP_THRESHOLD,
  SECRET_TAP_WINDOW_MS,
  type SecretTapState,
} from './secretRoleAccess';

const emptyState: SecretTapState = {
  target: null,
  count: 0,
  lastTapAt: 0,
};

describe('registerSecretRoleTap', () => {
  it('unlocks Staff after five consecutive student-tab taps', () => {
    let state = emptyState;

    for (let index = 0; index < SECRET_TAP_THRESHOLD; index += 1) {
      const result = registerSecretRoleTap(state, 'student', 1000 + index * 200);
      state = result.state;

      if (index < SECRET_TAP_THRESHOLD - 1) {
        expect(result.unlockedRole).toBeNull();
      } else {
        expect(result.unlockedRole).toBe('staff');
      }
    }
  });

  it('unlocks Admin after five consecutive parent-tab taps', () => {
    let state = emptyState;

    for (let index = 0; index < SECRET_TAP_THRESHOLD; index += 1) {
      const result = registerSecretRoleTap(state, 'parent', 2000 + index * 200);
      state = result.state;

      if (index < SECRET_TAP_THRESHOLD - 1) {
        expect(result.unlockedRole).toBeNull();
      } else {
        expect(result.unlockedRole).toBe('admin');
      }
    }
  });

  it('resets when switching tabs or waiting past the tap window', () => {
    const first = registerSecretRoleTap(emptyState, 'student', 1000);
    const second = registerSecretRoleTap(first.state, 'student', 1200);
    const switched = registerSecretRoleTap(second.state, 'parent', 1300);
    const expired = registerSecretRoleTap(switched.state, 'parent', 1300 + SECRET_TAP_WINDOW_MS + 1);

    expect(first.state.count).toBe(1);
    expect(second.state.count).toBe(2);
    expect(switched.state.target).toBe('parent');
    expect(switched.state.count).toBe(1);
    expect(expired.state.count).toBe(1);
    expect(expired.unlockedRole).toBeNull();
  });

  it('resets the tracker after unlocking', () => {
    let finalResult = registerSecretRoleTap(emptyState, 'student', 1000);

    for (let index = 1; index < SECRET_TAP_THRESHOLD; index += 1) {
      finalResult = registerSecretRoleTap(
        finalResult.state,
        'student',
        1000 + index * 100,
      );
    }

    expect(finalResult.unlockedRole).toBe('staff');
    expect(finalResult.state).toEqual(emptyState);
  });
});
