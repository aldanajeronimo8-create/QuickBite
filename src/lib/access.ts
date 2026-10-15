export type UserRole = 'admin' | 'student' | 'parent' | 'both' | 'student_parent' | 'all';

/** The single canonical role for trusted accounts with full QuickBite access. */
export function canAccessAdmin(role: UserRole) {
  return role === 'all' || role === 'admin' || role === 'both';
}

export function canAccessStudent(role: UserRole) {
  return role === 'all' || role === 'student' || role === 'both' || role === 'admin' || role === 'student_parent';
}

export function canAccessParent(role: UserRole) {
  return role === 'all' || role === 'parent' || role === 'student_parent';
}
