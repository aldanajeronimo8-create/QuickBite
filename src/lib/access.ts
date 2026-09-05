export type UserRole = 'admin' | 'student' | 'parent' | 'both' | 'student_parent';

export function canAccessAdmin(role: UserRole) {
  return role === 'admin' || role === 'both';
}

export function canAccessStudent(role: UserRole) {
  return role === 'student' || role === 'both' || role === 'admin' || role === 'student_parent';
}

export function canAccessParent(role: UserRole) {
  return role === 'parent' || role === 'student_parent';
}
