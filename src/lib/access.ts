export type UserRole = 'admin' | 'student' | 'both';

export function canAccessAdmin(role: UserRole) {
  return role === 'admin' || role === 'both';
}

export function canAccessStudent(role: UserRole) {
  return role === 'student' || role === 'both';
}
