export type UserRole = 'admin' | 'student' | 'parent' | 'both';

export function canAccessAdmin(role: UserRole) {
  return role === 'admin' || role === 'both';
}

export function canAccessStudent(role: UserRole) {
  return role === 'student' || role === 'both';
}

export function canAccessParent(role: UserRole) {
  return role === 'parent' || role === 'both';
}
