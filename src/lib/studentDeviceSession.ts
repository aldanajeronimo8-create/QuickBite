const STORAGE_KEY = 'quickbite.student.bound-user-id';

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getBoundStudentUserId() {
  return getStorage()?.getItem(STORAGE_KEY) ?? null;
}

export function bindStudentUser(userId: string) {
  getStorage()?.setItem(STORAGE_KEY, userId);
}

export function clearBoundStudentUser() {
  getStorage()?.removeItem(STORAGE_KEY);
}
