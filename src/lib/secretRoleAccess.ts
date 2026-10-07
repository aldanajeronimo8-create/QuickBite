export type PublicRoleTab = 'student' | 'parent';
export type InternalRole = 'staff' | 'admin';

export interface SecretTapState {
  target: PublicRoleTab | null;
  count: number;
  lastTapAt: number;
}

export const SECRET_TAP_THRESHOLD = 5;
export const SECRET_TAP_WINDOW_MS = 1800;

export interface SecretTapResult {
  state: SecretTapState;
  unlockedRole: InternalRole | null;
}

export function registerSecretRoleTap(
  state: SecretTapState,
  target: PublicRoleTab,
  now: number,
): SecretTapResult {
  const withinWindow =
    state.target === target && now - state.lastTapAt <= SECRET_TAP_WINDOW_MS;
  const count = withinWindow ? state.count + 1 : 1;

  if (count >= SECRET_TAP_THRESHOLD) {
    return {
      state: { target: null, count: 0, lastTapAt: 0 },
      unlockedRole: target === 'student' ? 'staff' : 'admin',
    };
  }

  return {
    state: { target, count, lastTapAt: now },
    unlockedRole: null,
  };
}
